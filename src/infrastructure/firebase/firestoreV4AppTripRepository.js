import { createFirestoreV4EditorTripWriter } from './firestoreV4EditorTripWriter.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';
import { hydrateV4Trip, v4TripListEntry } from './v4TripHydration.js';
import { V4_TRIP_SAVE_COLLECTIONS } from './v4TripSavePlan.js';

export const STORAGE_V4_REQUIRED_CODE = 'trip/storage-v4-required';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function storageV4RequiredError() {
  const error = new Error('El viaje guardado no pertenece al esquema Storage v4 de Atlas.');
  error.code = STORAGE_V4_REQUIRED_CODE;
  return error;
}

function writerRemoteCollections(collections) {
  return Object.fromEntries(
    V4_TRIP_SAVE_COLLECTIONS.map(({ tripField }) => [
      tripField,
      collections[tripField] || [],
    ])
  );
}

/**
 * Repositorio remoto canónico de Atlas.
 *
 * No detecta, migra ni escribe esquemas anteriores. Los roots que no sean v4
 * se ignoran al listar y se rechazan al abrir explícitamente. De esta forma el
 * runtime de producto tiene un único contrato persistente.
 */
export function createFirestoreV4AppTripRepository({
  db,
  uid,
  telemetryEnabled = false,
  repository = null,
  writer = null,
  writerFactory = createFirestoreV4EditorTripWriter,
} = {}) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  const remote = repository || createFirestoreV4TripRepository({ db, uid: ownerId });
  const editor = writer || writerFactory({
    db,
    uid: ownerId,
    telemetryEnabled,
    lifecycleReady: true,
    repository: remote,
  });

  if (
    !editor
    || typeof editor.save !== 'function'
    || typeof editor.remove !== 'function'
  ) {
    throw new TypeError('El writer v4 requiere save() y remove().');
  }

  let initialized = false;
  let initialization = null;

  async function initialize() {
    if (initialized || typeof editor.recoverPending !== 'function') return 0;
    if (!initialization) {
      initialization = Promise.resolve(editor.recoverPending())
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

  async function readCollections(tripId) {
    const entries = await Promise.all(
      V4_TRIP_SAVE_COLLECTIONS.map(async ({ tripField, entityType }) => [
        tripField,
        await remote.listEntities(tripId, entityType, { includeDeleted: true }),
      ])
    );
    return Object.fromEntries(entries);
  }

  return {
    initialize,

    async list() {
      const summaries = await remote.listTripSummaries();
      return summaries
        .filter((summary) => Number(summary.schemaVersion) === 4)
        .map((summary) => v4TripListEntry(summary.id, summary));
    },

    async get(id) {
      const tripId = requiredText(id, 'tripId');
      const summary = await remote.getTripSummary(tripId);
      if (!summary) return null;
      if (Number(summary.schemaVersion) !== 4) throw storageV4RequiredError();

      const collections = await readCollections(tripId);
      const hydrated = hydrateV4Trip(summary, collections);
      if (typeof editor.acceptRemoteState === 'function') {
        await editor.acceptRemoteState({
          tripId,
          remoteRoot: summary,
          remoteCollections: writerRemoteCollections(collections),
        });
      }
      return hydrated;
    },

    stage(rawTrip) {
      if (typeof editor.stage !== 'function') {
        return Promise.resolve({
          supported: false,
          autosync: false,
          state: 'manual',
          pending: 0,
        });
      }
      return editor.stage(rawTrip);
    },

    getPersistenceState(id) {
      if (typeof editor.getPersistenceState !== 'function') {
        return Promise.resolve({
          supported: false,
          autosync: false,
          state: 'manual',
          pending: 0,
        });
      }
      return editor.getPersistenceState(requiredText(id, 'tripId'));
    },

    save(rawTrip) {
      return editor.save(rawTrip);
    },

    remove(id) {
      return editor.remove(requiredText(id, 'tripId'));
    },

    async close() {
      await editor.close?.();
    },
  };
}
