import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { normalizeTrip } from '../../modules/trips/tripModel.js';
import {
  TRIP_REVISION_COLLECTIONS,
  createTripRevisionPayload,
  createVersionedTripListEntry,
  hydrateVersionedTrip,
  isVersionedTripSummary,
} from './tripStorageSchema.js';

const WRITE_BATCH_LIMIT = 400;

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

function createRevisionId() {
  const randomId = globalThis.crypto?.randomUUID?.().replaceAll('-', '');
  if (randomId) return randomId;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function documentIdForPosition(position) {
  return String(position).padStart(6, '0');
}

async function commitMutations(db, mutations) {
  for (let offset = 0; offset < mutations.length; offset += WRITE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    mutations.slice(offset, offset + WRITE_BATCH_LIMIT).forEach((mutation) => {
      if (mutation.type === 'delete') batch.delete(mutation.ref);
      else batch.set(mutation.ref, mutation.data);
    });
    await batch.commit();
  }
}

async function readRevisionCollections(revisionRef) {
  const snapshots = await Promise.all(
    TRIP_REVISION_COLLECTIONS.map((name) => getDocs(collection(revisionRef, name)))
  );

  return Object.fromEntries(
    snapshots.map((snapshot, index) => [
      TRIP_REVISION_COLLECTIONS[index],
      snapshot.docs.map((item) => item.data()),
    ])
  );
}

async function deleteRevision(db, revisionRef) {
  const snapshots = await Promise.all(
    TRIP_REVISION_COLLECTIONS.map((name) => getDocs(collection(revisionRef, name)))
  );
  const mutations = snapshots.flatMap((snapshot) =>
    snapshot.docs.map((item) => ({ type: 'delete', ref: item.ref }))
  );
  mutations.push({ type: 'delete', ref: revisionRef });
  await commitMutations(db, mutations);
}

async function cleanupOldRevisions(db, tripRef, activeRevision) {
  try {
    const revisions = await getDocs(collection(tripRef, 'revisions'));
    for (const revision of revisions.docs) {
      if (revision.id !== activeRevision) await deleteRevision(db, revision.ref);
    }
  } catch {
    // La revisión activa ya es válida; la limpieza se vuelve a intentar en otro guardado.
  }
}

export function createFirestoreTripRepository({ db, uid }) {
  if (!db) throw new Error('Se requiere una instancia de Firestore.');
  const ownerId = requireUid(uid);
  const tripsCollection = collection(db, 'users', ownerId, 'trips');

  return {
    async list() {
      const snapshot = await getDocs(query(tripsCollection, orderBy('updatedAt', 'desc')));
      return snapshot.docs.map((item) =>
        createVersionedTripListEntry(item.id, item.data())
          || normalizeTrip({ id: item.id, ...item.data() })
      );
    },

    async get(id) {
      const tripId = requireTripId(id);
      const tripRef = doc(tripsCollection, tripId);
      const snapshot = await getDoc(tripRef);
      if (!snapshot.exists()) return null;

      const stored = { id: snapshot.id, ...snapshot.data() };
      if (!isVersionedTripSummary(stored)) return normalizeTrip(stored);

      const revisionRef = doc(collection(tripRef, 'revisions'), stored.activeRevision);
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
      const revisionRef = doc(collection(tripRef, 'revisions'), revisionId);

      await setDoc(revisionRef, payload.revision);

      const mutations = TRIP_REVISION_COLLECTIONS.flatMap((name) =>
        payload.collections[name].map((item, position) => ({
          type: 'set',
          ref: doc(collection(revisionRef, name), documentIdForPosition(position)),
          data: item,
        }))
      );
      await commitMutations(db, mutations);
      await setDoc(revisionRef, { ...payload.revision, complete: true });
      await setDoc(tripRef, payload.summary);
      await cleanupOldRevisions(db, tripRef, revisionId);
      return payload.trip;
    },

    async remove(id) {
      const tripId = requireTripId(id);
      const tripRef = doc(tripsCollection, tripId);
      const revisions = await getDocs(collection(tripRef, 'revisions'));
      await deleteDoc(tripRef);

      for (const revision of revisions.docs) {
        try {
          await deleteRevision(db, revision.ref);
        } catch {
          // El viaje ya no es visible; una limpieza posterior puede retirar el huérfano.
        }
      }
    },
  };
}
