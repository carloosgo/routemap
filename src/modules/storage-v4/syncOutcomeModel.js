import { leaseStillOwned } from './crossContextLeaseModel.js';
import { V4_LOCAL_STATES } from './storageV4Contract.js';

function sameBase(left, right) {
  return left?.baseVersion === right?.baseVersion
    && left?.baseStatus === right?.baseStatus;
}

function validCurrentState(currentEntity, currentMutation, sentMutation) {
  if (!currentEntity || currentEntity.key !== sentMutation.entityKey) return false;
  if (!currentMutation || currentMutation.entityKey !== sentMutation.entityKey) return false;
  if (!sameBase(currentMutation, sentMutation)) return false;
  if (currentMutation.localRevision < sentMutation.localRevision) return false;
  return currentEntity.localRevision === currentMutation.localRevision;
}

export function planSyncRetry({
  lease,
  currentEntity,
  currentMutation,
  sentMutation,
  contextId,
  generation,
  nowMs,
  nextAttemptAt,
} = {}) {
  if (!sentMutation?.entityKey) throw new TypeError('sentMutation es obligatoria.');
  if (!Number.isInteger(nextAttemptAt) || nextAttemptAt < nowMs) {
    throw new TypeError('nextAttemptAt debe ser un entero posterior o igual a nowMs.');
  }
  if (!leaseStillOwned(lease, { contextId, generation, nowMs })) {
    return { apply: false, reason: 'lease-lost' };
  }
  if (!validCurrentState(currentEntity, currentMutation, sentMutation)) {
    return { apply: false, reason: 'local-state-changed' };
  }

  return {
    apply: true,
    entity: {
      ...currentEntity,
      state: V4_LOCAL_STATES.DIRTY,
    },
    mutation: {
      ...currentMutation,
      attempts: currentMutation.attempts + 1,
      nextAttemptAt,
    },
  };
}

export function planSyncConflict({
  lease,
  currentEntity,
  currentMutation,
  sentMutation,
  remoteEntity,
  contextId,
  generation,
  nowMs,
} = {}) {
  if (!sentMutation?.entityKey) throw new TypeError('sentMutation es obligatoria.');
  if (!remoteEntity || !Number.isInteger(remoteEntity.serverVersion)
      || remoteEntity.serverVersion <= sentMutation.baseVersion) {
    throw new TypeError('El conflicto requiere una versión remota posterior a baseVersion.');
  }
  if (remoteEntity.serverStatus !== 'active' && remoteEntity.serverStatus !== 'deleted') {
    throw new TypeError('serverStatus remoto inválido para conflicto.');
  }
  if (!leaseStillOwned(lease, { contextId, generation, nowMs })) {
    return { apply: false, reason: 'lease-lost' };
  }
  if (!validCurrentState(currentEntity, currentMutation, sentMutation)) {
    return { apply: false, reason: 'local-state-changed' };
  }

  return {
    apply: true,
    entity: {
      ...currentEntity,
      serverVersion: remoteEntity.serverVersion,
      serverStatus: remoteEntity.serverStatus,
      state: V4_LOCAL_STATES.CONFLICT,
      conflict: {
        serverVersion: remoteEntity.serverVersion,
        serverStatus: remoteEntity.serverStatus,
        payload: remoteEntity.payload ?? null,
        detectedAtLocal: nowMs,
      },
    },
    mutation: null,
  };
}
