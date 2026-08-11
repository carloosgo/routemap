import {
  normalizeDraftRecord,
  normalizeLocalEntityRecord,
  normalizeMutationRecord,
} from './localPersistenceContract.js';
import {
  acquireOrRenewLease,
  leaseStillOwned,
} from './crossContextLeaseModel.js';

function copy(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createMemoryV4LocalPersistence() {
  const drafts = new Map();
  const entities = new Map();
  const mutations = new Map();
  let syncLease = null;

  return {
    async getDraft(key) {
      return copy(drafts.get(key) || null);
    },

    async putDraft(record) {
      const normalized = normalizeDraftRecord(record);
      drafts.set(normalized.key, copy(normalized));
      return copy(normalized);
    },

    async deleteDraft(key) {
      return drafts.delete(key);
    },

    async getEntity(key) {
      return copy(entities.get(key) || null);
    },

    async putEntity(record) {
      const normalized = normalizeLocalEntityRecord(record);
      entities.set(normalized.key, copy(normalized));
      return copy(normalized);
    },

    async listEntities({ userId, tripId = null } = {}) {
      return Array.from(entities.values())
        .filter((record) => record.userId === userId)
        .filter((record) => tripId == null || record.tripId === tripId)
        .map(copy);
    },

    async getMutation(entityKey) {
      return copy(mutations.get(entityKey) || null);
    },

    async putMutation(record) {
      const normalized = normalizeMutationRecord(record);
      mutations.set(normalized.entityKey, copy(normalized));
      return copy(normalized);
    },

    async listMutations({ userId, tripId = null } = {}) {
      return Array.from(mutations.values())
        .filter((record) => record.userId === userId)
        .filter((record) => tripId == null || record.tripId === tripId)
        .sort((left, right) => left.createdAtLocal - right.createdAtLocal)
        .map(copy);
    },

    async deleteMutationIfRevision(entityKey, expectedLocalRevision) {
      const current = mutations.get(entityKey);
      if (!current || current.localRevision !== expectedLocalRevision) return false;
      mutations.delete(entityKey);
      return true;
    },

    async tryAcquireSyncLease({ contextId, nowMs, ttlMs }) {
      const next = acquireOrRenewLease({
        currentLease: syncLease,
        contextId,
        nowMs,
        ttlMs,
      });
      if (!next) return null;
      syncLease = copy(next);
      return copy(next);
    },

    async releaseSyncLeaseIfOwned({ contextId, generation, nowMs }) {
      if (!leaseStillOwned(syncLease, { contextId, generation, nowMs })) return false;
      syncLease = null;
      return true;
    },

    async clearUserData(userId) {
      for (const [key, record] of entities) {
        if (record.userId === userId) entities.delete(key);
      }
      for (const [key, record] of mutations) {
        if (record.userId === userId) mutations.delete(key);
      }
    },
  };
}
