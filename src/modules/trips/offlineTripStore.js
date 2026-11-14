import { createIndexedDbV4LocalPersistence } from '../storage-v4/indexedDbLocalPersistence.js';
import { normalizeTrip } from './tripModel.js';

/**
 * Copia en el teléfono de todos los viajes de la cuenta, para usarlos sin
 * internet. Guarda la última versión conocida en ESTE dispositivo: la que
 * llegó de la nube o la que se acaba de editar aquí. Vive en el mismo
 * IndexedDB de Storage v4 (registros "draft" con su propio scope), así que no
 * agrega otro mecanismo de persistencia ni toca la cola de sincronización.
 */

const SCOPE_PREFIX = 'trip-offline';
const INDEX_ID = '__index__';
const LAST_ID = '__last__';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

export function offlineTripScopeId(ownerId) {
  return `${SCOPE_PREFIX}:${requiredText(ownerId, 'ownerId')}`;
}

function totalOf(entry) {
  return Number(entry?.total) || 0;
}

/** Fila de "Viajes guardados" a partir de un viaje completo. */
export function offlineListEntry(trip, previous = null) {
  return {
    id: trip.id,
    name: trip.name || '',
    currency: trip.currency || 'USD',
    schemaVersion: 4,
    status: 'active',
    version: Number(previous?.version) || 0,
    createdAt: trip.createdAt || previous?.createdAt || '',
    updatedAt: trip.updatedAt || previous?.updatedAt || '',
    segmentCount: Array.isArray(trip.segments) ? trip.segments.length : 0,
    placeCount: Array.isArray(trip.places) ? trip.places.length : 0,
    total: totalOf(previous),
  };
}

export function createOfflineTripStore({
  ownerId,
  localPersistence = null,
  persistenceFactory = createIndexedDbV4LocalPersistence,
  now = () => Date.now(),
} = {}) {
  const scopeId = offlineTripScopeId(ownerId);
  let local = localPersistence;
  let unavailable = false;
  // Escrituras en orden: el índice se lee y reescribe, no debe pisarse.
  let queue = Promise.resolve();

  function persistence() {
    if (local) return local;
    if (unavailable) return null;
    try {
      local = persistenceFactory();
      return local;
    } catch {
      unavailable = true;
      return null;
    }
  }

  function serial(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function read(draftId) {
    const adapter = persistence();
    if (!adapter) return null;
    const record = await adapter.getDraft(`${scopeId}/${draftId}`);
    return record?.payload ?? null;
  }

  async function write(draftId, payload) {
    const adapter = persistence();
    if (!adapter) return false;
    await adapter.putDraft({
      scopeId,
      draftId,
      payload,
      lastModifiedLocal: Math.max(0, Math.trunc(Number(now()) || 0)),
    });
    return true;
  }

  async function readIndex() {
    const index = await read(INDEX_ID);
    return Array.isArray(index) ? index : [];
  }

  async function getTrip(tripId) {
    const payload = await read(requiredText(tripId, 'tripId'));
    if (!payload) return null;
    try {
      return normalizeTrip(payload);
    } catch {
      return null;
    }
  }

  return {
    getTrip,

    /** Lista guardada en el teléfono, o null si nunca se guardó. */
    async getList() {
      const index = await read(INDEX_ID);
      return Array.isArray(index) ? index : null;
    },

    /** La lista de la nube reemplaza la del teléfono (quita los borrados). */
    putList(entries) {
      return serial(async () => {
        const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.id);
        const previous = await readIndex().catch(() => []);
        await write(INDEX_ID, list);
        const keep = new Set(list.map((entry) => entry.id));
        const adapter = persistence();
        await Promise.all(previous
          .filter((entry) => !keep.has(entry.id))
          .map((entry) => adapter?.deleteDraft(`${scopeId}/${entry.id}`).catch(() => {})));
      });
    },

    /** Guarda la última versión conocida de un viaje y actualiza su fila. */
    putTrip(rawTrip) {
      return serial(async () => {
        const trip = normalizeTrip(rawTrip);
        if (!trip.id) return false;
        await write(trip.id, trip);
        const index = await readIndex();
        const position = index.findIndex((entry) => entry.id === trip.id);
        const entry = offlineListEntry(trip, position >= 0 ? index[position] : null);
        const next = position >= 0
          ? index.map((current, i) => (i === position ? entry : current))
          : [entry, ...index];
        await write(INDEX_ID, next);
        return true;
      });
    },

    removeTrip(tripId) {
      return serial(async () => {
        const id = requiredText(tripId, 'tripId');
        const adapter = persistence();
        await adapter?.deleteDraft(`${scopeId}/${id}`).catch(() => {});
        const index = await readIndex();
        await write(INDEX_ID, index.filter((entry) => entry.id !== id));
        if ((await read(LAST_ID)) === id) await adapter?.deleteDraft(`${scopeId}/${LAST_ID}`);
      });
    },

    /** Último viaje abierto: con él arranca la app aunque no haya internet. */
    async getLastTripId() {
      const id = await read(LAST_ID);
      return typeof id === 'string' && id ? id : null;
    },

    setLastTripId(tripId) {
      return serial(() => write(LAST_ID, requiredText(tripId, 'tripId')));
    },

    async close() {
      await queue.catch(() => undefined);
      await local?.close?.();
      local = null;
    },
  };
}
