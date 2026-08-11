import {
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
  const entities = new Map();
  const mutations = new Map();
  let syncLease = null;

  return {
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

    async getMutation(mutationId) {
      return copy(mutations.get(mutationId) || null);
    },

    async putMutation(record) {
      const normalized = normalizeMutationRecord(record);
      mutations.set(normalized.mutationId, copy(normalized));
      return copy(normalized);
    },

    async listMutations({ userId, tripId = null } = {}) {
      return Array.from(mutations.values())
        .filter((record) => record.userId === userId)
        .filter((record) => tripId == null || record.tripId === tripId)
        .sort((left, right) => left.createdAtLocal - right.createdAtLocal)
        .map(copy);
    },

    async deleteMutationIfMatch(mutationId, expectedEntityKey, expectedCreatedAtLocal) {
      const current = mutations.get(mutationId);
      if (!current) return false;
      if (
        current.entityKey !== expectedEntityKey
        || current.createdAtLocal !== expectedCreatedAtLocal
      ) {
        return false;
      }
      mutations.delete(mutationId);
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
