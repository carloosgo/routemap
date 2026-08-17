import { createIndexedDbV4LocalPersistence } from '../storage-v4/indexedDbLocalPersistence.js';
import { normalizeTrip } from './tripModel.js';

const DRAFT_SCOPE_PREFIX = 'trip-editor';
const ACTIVE_DRAFT_ID = '__active__';

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

function validDraftTrip(record, expectedId = null) {
  if (!record?.payload) return null;
  try {
    const trip = normalizeTrip(record.payload);
    return expectedId == null || trip.id === expectedId ? trip : null;
  } catch {
    return null;
  }
}

/**
 * Durable editor drafts share the Storage v4 IndexedDB database but remain a
 * separate concern from canonical mutations. Writing a draft never touches
 * Firestore; it is safe to do frequently while the user edits.
 *
 * Besides the per-trip record, one reserved draft record tracks the active
 * editor payload. That lets a brand-new, never-remotely-saved trip survive a
 * full page reload without introducing localStorage or a parallel persistence
 * mechanism.
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

  async function getDraft(tripId) {
    const id = requiredText(tripId, 'tripId');
    const adapter = persistence();
    if (!adapter) return null;
    const record = await adapter.getDraft(tripDraftKey(ownerScope, id));
    const trip = validDraftTrip(record, id);
    if (trip) return trip;
    if (record) await adapter.deleteDraft(record.key).catch(() => {});
    return null;
  }

  async function getActiveDraft() {
    const adapter = persistence();
    if (!adapter) return null;
    const key = tripDraftKey(ownerScope, ACTIVE_DRAFT_ID);
    const record = await adapter.getDraft(key);
    const trip = validDraftTrip(record);
    if (trip) return trip;
    if (record) await adapter.deleteDraft(key).catch(() => {});
    return null;
  }

  return {
    async put(rawTrip) {
      const trip = normalizeTrip(rawTrip);
      const adapter = persistence();
      if (!adapter) return { durable: false, trip };
      const lastModifiedLocal = Math.max(
        0,
        Math.trunc(Number(now()) || Date.now())
      );
      const [record] = await Promise.all([
        adapter.putDraft({
          scopeId: ownerScope,
          draftId: trip.id,
          payload: trip,
          lastModifiedLocal,
        }),
        adapter.putDraft({
          scopeId: ownerScope,
          draftId: ACTIVE_DRAFT_ID,
          payload: trip,
          lastModifiedLocal,
        }),
      ]);
      return { durable: true, trip, record };
    },

    get: getDraft,
    getActive: getActiveDraft,

    async delete(tripId) {
      const id = requiredText(tripId, 'tripId');
      const adapter = persistence();
      if (!adapter) return false;
      const activeKey = tripDraftKey(ownerScope, ACTIVE_DRAFT_ID);
      const active = validDraftTrip(await adapter.getDraft(activeKey));
      const results = await Promise.all([
        adapter.deleteDraft(tripDraftKey(ownerScope, id)),
        active?.id === id
          ? adapter.deleteDraft(activeKey)
          : Promise.resolve(false),
      ]);
      return results.some(Boolean);
    },

    async has(tripId) {
      return Boolean(await getDraft(tripId));
    },

    async close() {
      await local?.close?.();
      local = null;
    },
  };
}
