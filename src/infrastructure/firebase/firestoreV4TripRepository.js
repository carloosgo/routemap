import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { v4TripCreateDocument, v4TripMetadataPatch } from './v4TripDocument.js';
import {
  v4EntityCollection,
  v4EntityCreateDocument,
  v4EntityDeletePatch,
  v4EntityRestorePatch,
  v4EntityUpdatePatch,
} from './v4EntityDocuments.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return 0;
}

export function createFirestoreV4TripRepository({ db, uid }) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  const trips = collection(db, 'users', ownerId, 'trips');

  const tripRef = (tripId) => doc(trips, requiredText(tripId, 'tripId'));
  const entityRef = (tripId, entityType, entityId) => doc(
    collection(tripRef(tripId), v4EntityCollection(entityType)),
    requiredText(entityId, 'entityId')
  );

  return {
    async createTripRoot(rawTrip) {
      const ref = tripRef(rawTrip?.id);
      const data = v4TripCreateDocument(rawTrip, serverTimestamp());
      await setDoc(ref, data);
      return { id: data.id, version: data.version };
    },

    async updateTripMetadata(rawTrip, baseVersion) {
      const ref = tripRef(rawTrip?.id);
      const patch = v4TripMetadataPatch(rawTrip, baseVersion, serverTimestamp());
      await updateDoc(ref, patch);
      return { id: rawTrip.id, version: patch.version };
    },

    async listTripSummaries() {
      const snapshot = await getDocs(query(trips, where('status', '==', 'active')));
      return snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => timestampMillis(right.updatedAt) - timestampMillis(left.updatedAt));
    },

    async getTripSummary(tripId) {
      const snapshot = await getDoc(tripRef(tripId));
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    },

    async listEntities(tripId, entityType, { includeDeleted = false } = {}) {
      const source = collection(tripRef(tripId), v4EntityCollection(entityType));
      const target = includeDeleted ? source : query(source, where('status', '==', 'active'));
      const snapshot = await getDocs(target);
      return snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => String(left.rank).localeCompare(String(right.rank)));
    },

    async getEntity(tripId, entityType, entityId) {
      const snapshot = await getDoc(entityRef(tripId, entityType, entityId));
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    },

    async createEntity(tripId, entityType, rawEntity, rank) {
      const ref = entityRef(tripId, entityType, rawEntity?.id);
      const data = v4EntityCreateDocument(
        entityType,
        rawEntity,
        rank,
        serverTimestamp()
      );
      await setDoc(ref, data);
      return { id: data.id, version: data.version };
    },

    async updateEntity(tripId, entityType, rawEntity, rank, baseVersion) {
      const ref = entityRef(tripId, entityType, rawEntity?.id);
      const patch = v4EntityUpdatePatch(
        entityType,
        rawEntity,
        rank,
        baseVersion,
        serverTimestamp()
      );
      await updateDoc(ref, patch);
      return { id: rawEntity.id, version: patch.version };
    },

    async softDeleteEntity(tripId, entityType, entityId, baseVersion) {
      const patch = v4EntityDeletePatch(baseVersion, serverTimestamp());
      await updateDoc(entityRef(tripId, entityType, entityId), patch);
      return { id: entityId, version: patch.version };
    },

    async restoreEntity(tripId, entityType, entityId, baseVersion) {
      const patch = v4EntityRestorePatch(baseVersion, serverTimestamp());
      await updateDoc(entityRef(tripId, entityType, entityId), patch);
      return { id: entityId, version: patch.version };
    },
  };
}
