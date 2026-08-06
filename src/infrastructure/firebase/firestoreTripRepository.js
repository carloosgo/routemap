import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
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

export function createFirestoreTripRepository({ db, uid }) {
  if (!db) throw new Error('Se requiere una instancia de Firestore.');
  const ownerId = requireUid(uid);
  const tripsCollection = collection(db, 'users', ownerId, 'trips');

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

    async save(rawTrip) {
      const revisionId = createRevisionId();
      const now = new Date().toISOString();
      const payload = createTripRevisionPayload(rawTrip, revisionId, now);
      const tripRef = doc(tripsCollection, payload.trip.id);
      const revisionRef = revisionRefFor(tripRef, revisionId);

      await writeRevisionPayload(db, revisionRef, payload);
      await setDoc(tripRef, payload.summary);
      await cleanupOldRevisions(db, tripRef, revisionId);
      return payload.trip;
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
