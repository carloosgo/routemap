import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
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

function storedVersion(snapshot) {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    storageVersion: Number(data?.storageVersion) || 0,
    activeRevision:
      typeof data?.activeRevision === 'string' ? data.activeRevision : '',
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
  };
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
  let saveQueue = Promise.resolve();

  async function saveOnce(rawTrip) {
    const revisionId = createRevisionId();
    const now = new Date().toISOString();
    const payload = createTripRevisionPayload(rawTrip, revisionId, now);
    const tripRef = doc(tripsCollection, payload.trip.id);
    const revisionRef = revisionRefFor(tripRef, revisionId);
    const baseVersion = storedVersion(await getDoc(tripRef));

    await writeRevisionPayload(db, revisionRef, payload);

    try {
      await runTransaction(db, async (transaction) => {
        const currentVersion = storedVersion(await transaction.get(tripRef));
        if (!sameStoredTripVersion(currentVersion, baseVersion)) {
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

    await cleanupOldRevisions(db, tripRef, revisionId);
    return payload.trip;
  }

  return {
    async list() {
      const snapshot = await getDocs(
        query(tripsCollection, orderBy('updatedAt', 'desc'))
      );
      return snapshot.docs.map(
        (item) =>
          createVersionedTripListEntry(item.id, item.data()) ||
          normalizeTrip({ id: item.id, ...item.data() })
      );
    },

    async get(id) {
      const tripId = requireTripId(id);
      const tripRef = doc(tripsCollection, tripId);
      const snapshot = await getDoc(tripRef);
      if (!snapshot.exists()) return null;

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
      const operation = saveQueue.then(
        () => saveOnce(rawTrip),
        () => saveOnce(rawTrip)
      );
      saveQueue = operation.catch(() => undefined);
      return operation;
    },

    async remove(id) {
      const tripId = requireTripId(id);
      const tripRef = doc(tripsCollection, tripId);
      const revisionRefs = await listRevisionRefs(tripRef);
      await deleteDoc(tripRef);

      for (const revisionRef of revisionRefs) {
        try {
          await deleteRevision(db, revisionRef);
        } catch {
          // El viaje ya no es visible; una limpieza posterior puede retirar el huérfano.
        }
      }
    },
  };
}
