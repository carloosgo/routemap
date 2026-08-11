import { assertLocalPersistenceAdapter } from './localPersistenceContract.js';
import { syncRetryDelayMs } from './syncRetryModel.js';

export const V4_REMOTE_ERROR_KIND = Object.freeze({
  RETRYABLE: 'retryable',
  CONFLICT: 'conflict',
});

export class V4RemoteSyncError extends Error {
  constructor(kind, message, options = {}) {
    super(message, options);
    this.name = 'V4RemoteSyncError';
    this.kind = kind;
    this.remoteEntity = options.remoteEntity || null;
  }
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function requireGateway(gateway) {
  if (typeof gateway?.writeMutation !== 'function') {
    throw new TypeError('El gateway remoto v4 requiere writeMutation().');
  }
  return gateway;
}

function dueMutation(mutation, nowMs) {
  return mutation.nextAttemptAt == null || mutation.nextAttemptAt <= nowMs;
}

function validWriteResult(result) {
  if (!Number.isInteger(result?.serverVersion) || result.serverVersion < 1) {
    throw new TypeError('writeMutation() debe devolver serverVersion positivo.');
  }
  if (result.serverStatus !== 'active' && result.serverStatus !== 'deleted') {
    throw new TypeError('writeMutation() debe devolver serverStatus válido.');
  }
  return result;
}

function isKnownRemoteError(error) {
  return error instanceof V4RemoteSyncError
    && Object.values(V4_REMOTE_ERROR_KIND).includes(error.kind);
}

export function createV4SyncCoordinator({
  localPersistence,
  remoteGateway,
  contextId,
  now = () => Date.now(),
  randomUnit = () => Math.random(),
  leaseTtlMs = 8000,
  maxMutationsPerFlush = 20,
} = {}) {
  const local = assertLocalPersistenceAdapter(localPersistence);
  const remote = requireGateway(remoteGateway);
  const ownerContextId = requiredText(contextId, 'contextId');
  if (!Number.isInteger(maxMutationsPerFlush) || maxMutationsPerFlush < 1) {
    throw new TypeError('maxMutationsPerFlush debe ser un entero positivo.');
  }

  async function renewLease() {
    return local.tryAcquireSyncLease({
      contextId: ownerContextId,
      nowMs: now(),
      ttlMs: leaseTtlMs,
    });
  }

  return {
    async flush({ userId, tripId = null } = {}) {
      const ownerId = requiredText(userId, 'userId');
      let lease = await renewLease();
      if (!lease) {
        return { leader: false, attempted: 0, synced: 0, retried: 0, conflicts: 0 };
      }

      const summary = {
        leader: true,
        attempted: 0,
        synced: 0,
        retried: 0,
        conflicts: 0,
      };

      try {
        const listed = await local.listMutations({ userId: ownerId, tripId });
        const eligible = listed
          .filter((mutation) => dueMutation(mutation, now()))
          .slice(0, maxMutationsPerFlush);

        for (const sentMutation of eligible) {
          lease = await renewLease();
          if (!lease) break;
          summary.attempted += 1;

          try {
            const remoteResult = validWriteResult(
              await remote.writeMutation(sentMutation)
            );
            const outcome = await local.acknowledgeSyncedMutation({
              sentMutation,
              serverVersion: remoteResult.serverVersion,
              serverStatus: remoteResult.serverStatus,
              contextId: ownerContextId,
              generation: lease.generation,
              nowMs: now(),
            });
            if (outcome.apply) summary.synced += 1;
            if (outcome.reason === 'lease-lost') break;
          } catch (error) {
            if (!isKnownRemoteError(error)) throw error;

            if (error.kind === V4_REMOTE_ERROR_KIND.CONFLICT) {
              const outcome = await local.recordSyncConflict({
                sentMutation,
                remoteEntity: error.remoteEntity,
                contextId: ownerContextId,
                generation: lease.generation,
                nowMs: now(),
              });
              if (outcome.apply) summary.conflicts += 1;
              if (outcome.reason === 'lease-lost') break;
              continue;
            }

            const failureTime = now();
            const delay = syncRetryDelayMs(sentMutation.attempts, {
              randomUnit: randomUnit(),
            });
            const outcome = await local.recordSyncFailure({
              sentMutation,
              contextId: ownerContextId,
              generation: lease.generation,
              nowMs: failureTime,
              nextAttemptAt: failureTime + delay,
            });
            if (outcome.apply) summary.retried += 1;
            if (outcome.reason === 'lease-lost') break;
          }
        }

        return summary;
      } finally {
        await local.releaseSyncLeaseIfOwned({
          contextId: ownerContextId,
          generation: lease.generation,
          nowMs: now(),
        });
      }
    },
  };
}
