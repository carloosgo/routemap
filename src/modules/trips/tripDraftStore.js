import { createIndexedDbV4LocalPersistence } from '../storage-v4/indexedDbLocalPersistence.js';
import { normalizeTrip } from './tripModel.js';

const DRAFT_SCOPE_PREFIX = 'trip-editor';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

export function tripDraftScopeId(ownerId = 'anonymous') {
  return `${DRAFT_SCOPE_PREFIX}:${requiredText(ownerId || 'anonymous', 'ownerId')}`;
}

export function tripDraftKey(scopeId, tripId) {
  return `${requiredText(scopeId, 'scopeId')}/${requiredText(tripId, 'tripId')}`;
}

/**
 * Durable editor drafts share the Storage v4 IndexedDB database but remain a
 * separate concern from canonical mutations. Writing a draft never touches
 * Firestore; it is safe to do frequently while the user edits.
 */
export function createTripDraftStore({
  scopeId,
  localPersistence = null,
  persistenceFactory = createIndexedDbV4LocalPersistence,
  now = () => Date.now(),
} = {}) {
  const ownerScope = requiredText(scopeId, 'scopeId');
  let local = localPersistence;
  let unavailable = false;

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

  return {
    async put(rawTrip) {
      const trip = normalizeTrip(rawTrip);
      const adapter = persistence();
      if (!adapter) return { durable: false, trip };
      const record = await adapter.putDraft({
        scopeId: ownerScope,
        draftId: trip.id,
        payload: trip,
        lastModifiedLocal: Math.max(0, Math.trunc(Number(now()) || Date.now())),
      });
      return { durable: true, trip, record };
    },

    async get(tripId) {
      const id = requiredText(tripId, 'tripId');
      const adapter = persistence();
      if (!adapter) return null;
      const record = await adapter.getDraft(tripDraftKey(ownerScope, id));
      if (!record?.payload) return null;
      try {
        const trip = normalizeTrip(record.payload);
        return trip.id === id ? trip : null;
      } catch {
        await adapter.deleteDraft(record.key).catch(() => {});
        return null;
      }
    },

    async delete(tripId) {
      const id = requiredText(tripId, 'tripId');
      const adapter = persistence();
      if (!adapter) return false;
      return adapter.deleteDraft(tripDraftKey(ownerScope, id));
    },

    async has(tripId) {
      return Boolean(await this.get(tripId));
    },

    async close() {
      await local?.close?.();
      local = null;
    },
  };
}
