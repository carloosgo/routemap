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

function requireUid(uid) {
  const normalized = typeof uid === 'string' ? uid.trim() : '';
  if (!normalized) throw new Error('Se requiere un usuario autenticado.');
  return normalized;
}

function requireTripId(id) {
  const normalized = typeof id === 'string' ? id.trim() : '';
  if (!normalized) throw new Error('Se requiere un identificador de viaje válido.');
  return normalized;
}

export function createFirestoreTripRepository({ db, uid }) {
  if (!db) throw new Error('Se requiere una instancia de Firestore.');
  const ownerId = requireUid(uid);
  const tripsCollection = collection(db, 'users', ownerId, 'trips');

  return {
    async list() {
      const snapshot = await getDocs(query(tripsCollection, orderBy('updatedAt', 'desc')));
      return snapshot.docs.map((item) => normalizeTrip({ id: item.id, ...item.data() }));
    },

    async get(id) {
      const tripId = requireTripId(id);
      const snapshot = await getDoc(doc(tripsCollection, tripId));
      return snapshot.exists() ? normalizeTrip({ id: snapshot.id, ...snapshot.data() }) : null;
    },

    async save(rawTrip) {
      const trip = normalizeTrip(rawTrip);
      const now = new Date().toISOString();
      const storedTrip = {
        ...trip,
        createdAt: trip.createdAt || now,
        updatedAt: now,
      };

      await setDoc(doc(tripsCollection, storedTrip.id), storedTrip);
      return storedTrip;
    },

    async remove(id) {
      const tripId = requireTripId(id);
      await deleteDoc(doc(tripsCollection, tripId));
    },
  };
}
