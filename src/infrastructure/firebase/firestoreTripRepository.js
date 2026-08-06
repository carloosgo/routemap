import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
} from 'firebase/firestore';
import { normalizeTrip } from '../../modules/trips/tripModel.js';
import {
  createTripRevisionPayload,
  createVersionedTripListEntry,
  hydrateVersionedTrip,
  isVersionedTripSummary,
} from './tripStorageSchema.js';
import {
  cleanupOldRevisions,
  createRevisionId,
  deleteRevision,
  listRevisionRefs,
  readRevisionCollections,
  revisionRefFor,
  writeRevisionPayload,
} from './firestoreTripRevisionStore.js';

const SAVE_CONFLICT_CODE = 'trip/save-conflict';

function requireUid(uid) {
  const normalized = typeof uid === 'string' ? uid.trim() : '';
  if (!normalized) throw new Error('Se requiere un usuario autenticado.');
  return normalized;
}

function requireTripId(id) {
  const normalized = typeof id === 'string' ? id.trim() : '';
  if (!normalized) {
    throw new Error('Se requiere un identificador de viaje válido.');
  }
  return normalized;
}

function storedVersionFromData(data) {
  if (!data) return null;
  return {
    storageVersion: Number(data.storageVersion) || 0,
    activeRevision:
      typeof data.activeRevision === 'string' ? data.activeRevision : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
  };
}

function storedVersion(snapshot) {
  return snapshot.exists() ? storedVersionFromData(snapshot.data()) : null;
}

export function sameStoredTripVersion(left, right) {
  if (left === null || right === null) return left === right;
  return (
    left.storageVersion === right.storageVersion
    && left.activeRevision === right.activeRevision
    && left.updatedAt === right.updatedAt
  );
}

function saveConflictError() {
  const error = new Error(
    'El viaje cambió en otra pestaña o dispositivo. Vuelve a abrirlo antes de guardar.'
  );
  error.code = SAVE_CONFLICT_CODE;
  return error;
}

function isSaveConflict(error) {
  return error?.code === SAVE_CONFLICT_CODE;
}

export function createFirestoreTripRepository({ db, uid }) {
  if (!db) throw new Error('Se requiere una instancia de Firestore.');
  const ownerId = requireUid(uid);
  const tripsCollection = collection(db, 'users', ownerId, 'trips');
  const knownVersions = new Map();
  let mutationQueue = Promise.resolve();

  function rememberSnapshot(snapshot, { overwrite = true } = {}) {
    if (!overwrite && knownVersions.has(snapshot.id)) return;
    knownVersions.set(snapshot.id, storedVersion(snapshot));
  }

  async function saveOnce(rawTrip) {
    const revisionId = createRevisionId();
    const now = new Date().toISOString();
    const payload = createTripRevisionPayload(rawTrip, revisionId, now);
    const tripRef = doc(tripsCollection, payload.trip.id);
    const revisionRef = revisionRefFor(tripRef, revisionId);
    const expectedVersion = knownVersions.get(payload.trip.id) ?? null;

    await writeRevisionPayload(db, revisionRef, payload);

    try {
      await runTransaction(db, async (transaction) => {
        const currentVersion = storedVersion(await transaction.get(tripRef));
        if (!sameStoredTripVersion(currentVersion, expectedVersion)) {
          throw saveConflictError();
        }
        transaction.set(tripRef, payload.summary);
      });
    } catch (error) {
      if (isSaveConflict(error)) {
        try {
          await deleteRevision(db, revisionRef);
        } catch {
          // La revisión nunca fue publicada y puede limpiarse posteriormente.
        }
      }
      throw error;
    }

    knownVersions.set(payload.trip.id, storedVersionFromData(payload.summary));
    await cleanupOldRevisions(db, tripRef, revisionId);
    return payload.trip;
  }

  async function removeOnce(id) {
    const tripId = requireTripId(id);
    const tripRef = doc(tripsCollection, tripId);
    const expectedVersion = knownVersions.get(tripId) ?? null;
    const revisionRefs = await listRevisionRefs(tripRef);

    await runTransaction(db, async (transaction) => {
      const currentVersion = storedVersion(await transaction.get(tripRef));
      if (!sameStoredTripVersion(currentVersion, expectedVersion)) {
        throw saveConflictError();
      }
      transaction.delete(tripRef);
    });

    knownVersions.delete(tripId);
    for (const revisionRef of revisionRefs) {
      try {
        await deleteRevision(db, revisionRef);
      } catch {
        // El viaje ya no es visible; una limpieza posterior puede retirar el huérfano.
      }
    }
  }

  function enqueueMutation(operation) {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => undefined);
    return result;
  }

  return {
    async list() {
      const snapshot = await getDocs(
        query(tripsCollection, orderBy('updatedAt', 'desc'))
      );
      return snapshot.docs.map((item) => {
        rememberSnapshot(item, { overwrite: false });
        return (
          createVersionedTripListEntry(item.id, item.data()) ||
          normalizeTrip({ id: item.id, ...item.data() })
        );
      });
    },

    async get(id) {
      const tripId = requireTripId(id);
      const tripRef = doc(tripsCollection, tripId);
      const snapshot = await getDoc(tripRef);
      if (!snapshot.exists()) {
        knownVersions.set(tripId, null);
        return null;
      }
      rememberSnapshot(snapshot);

      const stored = { id: snapshot.id, ...snapshot.data() };
      if (!isVersionedTripSummary(stored)) return normalizeTrip(stored);

      const revisionRef = revisionRefFor(tripRef, stored.activeRevision);
      const revision = await getDoc(revisionRef);
      if (!revision.exists() || revision.data()?.complete !== true) {
        throw new Error('La versión guardada del viaje está incompleta.');
      }

      const revisionCollections = await readRevisionCollections(revisionRef);
      return hydrateVersionedTrip(stored, revisionCollections);
    },

    save(rawTrip) {
      return enqueueMutation(() => saveOnce(rawTrip));
    },

    remove(id) {
      return enqueueMutation(() => removeOnce(id));
    },
  };
}
