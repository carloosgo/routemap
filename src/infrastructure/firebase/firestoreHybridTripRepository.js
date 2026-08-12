import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { createVersionedTripListEntry } from './tripStorageSchema.js';
import { createFirestoreTripRepository } from './firestoreTripRepository.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';
import { hydrateV4Trip, v4TripListEntry } from './v4TripHydration.js';
import { STORED_TRIP_KIND, storedTripKind } from './tripStorageKind.js';

export const V4_WRITE_NOT_ENABLED_CODE = 'trip/v4-write-not-enabled';
export const UNKNOWN_TRIP_STORAGE_CODE = 'trip/unknown-storage-version';
const V4_ENTITY_TYPES = Object.freeze([
  ['segments', 'segment'],
  ['places', 'place'],
  ['connections', 'connection'],
  ['notes', 'note'],
  ['checklist', 'checklist'],
]);

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new TypeError(`${field} es obligatorio.`);
  return text;
}

function timestampScore(value) {
  const time = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(time) ? time : 0;
}

function v4WriteDisabledError() {
  const error = new Error(
    'Storage v4 todavía está en rollout controlado y no admite escrituras desde este repositorio.'
  );
  error.code = V4_WRITE_NOT_ENABLED_CODE;
  return error;
}

function unknownStorageError() {
  const error = new Error('El viaje guardado usa un esquema desconocido.');
  error.code = UNKNOWN_TRIP_STORAGE_CODE;
  return error;
}

function normalizeV4Writer(writer) {
  if (writer == null) return null;
  if (typeof writer.save !== 'function' || typeof writer.remove !== 'function') {
    throw new TypeError('v4Writer requiere save() y remove().');
  }
  for (const method of ['acceptRemoteState', 'recoverPending', 'close']) {
    if (writer[method] != null && typeof writer[method] !== 'function') {
      throw new TypeError(`v4Writer.${method} debe ser función cuando existe.`);
    }
  }
  return writer;
}

function writerRemoteCollections(collections) {
  return {
    segments: collections.segments || [],
    places: collections.places || [],
    routeConnections: collections.connections || [],
    notes: collections.notes || [],
    checklist: collections.checklist || [],
  };
}

export function createFirestoreHybridTripRepository({ db, uid, v4Writer = null } = {}) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  const roots = collection(db, 'users', ownerId, 'trips');
  const v3 = createFirestoreTripRepository({ db, uid: ownerId });
  const v4 = createFirestoreV4TripRepository({ db, uid: ownerId });
  const writer = normalizeV4Writer(v4Writer);
  const knownKinds = new Map();
  let initialized = false;
  let initialization = null;

  async function readRootKind(tripId) {
    const id = requiredText(tripId, 'tripId');
    const snapshot = await getDoc(doc(roots, id));
    const kind = snapshot.exists() ? storedTripKind(snapshot.data()) : null;
    knownKinds.set(id, kind);
    return kind;
  }

  async function getV4Trip(tripId, summary) {
    const includeDeleted = typeof writer?.acceptRemoteState === 'function';
    const entries = await Promise.all(V4_ENTITY_TYPES.map(async ([name, type]) => [
      name,
      await v4.listEntities(tripId, type, { includeDeleted }),
    ]));
    const collections = Object.fromEntries(entries);
    const hydrated = hydrateV4Trip(summary, collections);
    if (includeDeleted) {
      await writer.acceptRemoteState({
        tripId,
        remoteRoot: summary,
        remoteCollections: writerRemoteCollections(collections),
      });
    }
    return hydrated;
  }

  async function initialize() {
    if (initialized || !writer?.recoverPending) return 0;
    if (!initialization) {
      initialization = Promise.resolve(writer.recoverPending())
        .then((recovered) => {
          initialized = true;
          return Number(recovered) || 0;
        })
        .finally(() => {
          initialization = null;
        });
    }
    return initialization;
  }

  return {
    initialize,

    async list() {
      const snapshot = await getDocs(roots);
      const items = [];
      for (const item of snapshot.docs) {
        const data = item.data();
        const kind = storedTripKind(data);
        knownKinds.set(item.id, kind);
        if (kind === STORED_TRIP_KIND.V4) {
          const entry = v4TripListEntry(item.id, data);
          if (entry.status === 'active') items.push(entry);
          continue;
        }
        if (kind === STORED_TRIP_KIND.V2 || kind === STORED_TRIP_KIND.V3) {
          const entry = createVersionedTripListEntry(item.id, data);
          if (entry) items.push(entry);
          continue;
        }
        if (kind === STORED_TRIP_KIND.LEGACY) {
          items.push(normalizeTrip({ id: item.id, ...data }));
        }
      }
      return items.sort(
        (left, right) => timestampScore(right.updatedAt) - timestampScore(left.updatedAt)
      );
    },

    async get(id) {
      const tripId = requiredText(id, 'tripId');
      const snapshot = await getDoc(doc(roots, tripId));
      if (!snapshot.exists()) {
        knownKinds.set(tripId, null);
        return null;
      }
      const data = { id: snapshot.id, ...snapshot.data() };
      const kind = storedTripKind(data);
      knownKinds.set(tripId, kind);
      if (kind === STORED_TRIP_KIND.V4) return getV4Trip(tripId, data);
      if (
        kind === STORED_TRIP_KIND.V2
        || kind === STORED_TRIP_KIND.V3
        || kind === STORED_TRIP_KIND.LEGACY
      ) {
        return v3.get(tripId);
      }
      throw unknownStorageError();
    },

    async save(rawTrip) {
      const tripId = requiredText(rawTrip?.id, 'trip.id');
      // Always route from a fresh root read. A backend migration may have changed
      // the storage kind while this tab remained open.
      const kind = await readRootKind(tripId);
      if (kind === STORED_TRIP_KIND.UNKNOWN) throw unknownStorageError();

      if (kind === STORED_TRIP_KIND.V4 || kind === null) {
        if (!writer) {
          if (kind === STORED_TRIP_KIND.V4) throw v4WriteDisabledError();
        } else {
          const saved = await writer.save(rawTrip);
          knownKinds.set(tripId, STORED_TRIP_KIND.V4);
          return saved;
        }
      }

      const saved = await v3.save(rawTrip);
      knownKinds.set(tripId, STORED_TRIP_KIND.V3);
      return saved;
    },

    async remove(id) {
      const tripId = requiredText(id, 'tripId');
      // Same migration-race protection as save(): never authorize a destructive
      // operation from a kind learned by a previous list/get call.
      const kind = await readRootKind(tripId);
      if (kind === STORED_TRIP_KIND.UNKNOWN) throw unknownStorageError();
      if (kind === STORED_TRIP_KIND.V4) {
        if (!writer) throw v4WriteDisabledError();
        await writer.remove(tripId);
        knownKinds.set(tripId, null);
        return;
      }
      await v3.remove(tripId);
      knownKinds.set(tripId, null);
    },

    async close() {
      await writer?.close?.();
    },
  };
}
