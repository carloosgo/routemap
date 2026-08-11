import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { createVersionedTripListEntry } from './tripStorageSchema.js';
import { createFirestoreTripRepository } from './firestoreTripRepository.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';
import { hydrateV4Trip, v4TripListEntry } from './v4TripHydration.js';
import { STORED_TRIP_KIND, storedTripKind } from './tripStorageKind.js';

export const V4_WRITE_NOT_ENABLED_CODE = 'trip/v4-write-not-enabled';
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

export function createFirestoreHybridTripRepository({ db, uid } = {}) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  const roots = collection(db, 'users', ownerId, 'trips');
  const v3 = createFirestoreTripRepository({ db, uid: ownerId });
  const v4 = createFirestoreV4TripRepository({ db, uid: ownerId });
  const knownKinds = new Map();

  async function rootKind(tripId) {
    const id = requiredText(tripId, 'tripId');
    if (knownKinds.has(id)) return knownKinds.get(id);
    const snapshot = await getDoc(doc(roots, id));
    const kind = snapshot.exists() ? storedTripKind(snapshot.data()) : null;
    knownKinds.set(id, kind);
    return kind;
  }

  async function getV4Trip(tripId, summary) {
    const entries = await Promise.all(V4_ENTITY_TYPES.map(async ([name, type]) => [
      name,
      await v4.listEntities(tripId, type),
    ]));
    return hydrateV4Trip(summary, Object.fromEntries(entries));
  }

  return {
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
        if (kind === STORED_TRIP_KIND.V3) {
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
      if (kind === STORED_TRIP_KIND.V3 || kind === STORED_TRIP_KIND.LEGACY) {
        return v3.get(tripId);
      }
      throw new Error('El viaje guardado usa un esquema desconocido.');
    },

    async save(rawTrip) {
      const tripId = requiredText(rawTrip?.id, 'trip.id');
      const kind = await rootKind(tripId);
      if (kind === STORED_TRIP_KIND.V4) throw v4WriteDisabledError();
      const saved = await v3.save(rawTrip);
      knownKinds.set(tripId, STORED_TRIP_KIND.V3);
      return saved;
    },

    async remove(id) {
      const tripId = requiredText(id, 'tripId');
      const kind = await rootKind(tripId);
      if (kind === STORED_TRIP_KIND.V4) throw v4WriteDisabledError();
      await v3.remove(tripId);
      knownKinds.set(tripId, null);
    },
  };
}
