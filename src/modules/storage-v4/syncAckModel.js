import { leaseStillOwned } from './crossContextLeaseModel.js';
import { rebasePendingMutation } from './pendingMutationModel.js';
import {
  V4_ENTITY_STATUS,
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from './storageV4Contract.js';

function expectedServerStatus(operation) {
  return operation === V4_MUTATION_OPERATIONS.DELETE
    ? V4_ENTITY_STATUS.DELETED
    : V4_ENTITY_STATUS.ACTIVE;
}

function validServerVersion(sentMutation, serverVersion) {
  return Number.isInteger(serverVersion)
    && serverVersion === sentMutation.baseVersion + 1;
}

function sameBase(left, right) {
  return left?.baseVersion === right?.baseVersion
    && left?.baseStatus === right?.baseStatus;
}

export function planSyncAcknowledgement({
  lease,
  currentEntity,
  currentMutation,
  sentMutation,
  serverVersion,
  serverStatus,
  contextId,
  generation,
  nowMs,
} = {}) {
  if (!sentMutation?.entityKey) throw new TypeError('sentMutation es obligatoria.');
  if (!validServerVersion(sentMutation, serverVersion)) {
    throw new TypeError('La versión confirmada por servidor no coincide con la mutación enviada.');
  }
  if (serverStatus !== expectedServerStatus(sentMutation.operation)) {
    throw new TypeError('El estado confirmado por servidor no coincide con la operación enviada.');
  }
  if (!leaseStillOwned(lease, { contextId, generation, nowMs })) {
    return { apply: false, reason: 'lease-lost' };
  }
  if (!currentEntity || currentEntity.key !== sentMutation.entityKey) {
    return { apply: false, reason: 'entity-changed' };
  }
  if (!currentMutation || currentMutation.entityKey !== sentMutation.entityKey) {
    return { apply: false, reason: 'mutation-changed' };
  }
  if (!sameBase(currentMutation, sentMutation)) {
    return { apply: false, reason: 'mutation-rebased' };
  }
  if (currentMutation.localRevision < sentMutation.localRevision) {
    return { apply: false, reason: 'mutation-older-than-sent' };
  }
  if (currentEntity.localRevision !== currentMutation.localRevision) {
    return { apply: false, reason: 'entity-mutation-revision-mismatch' };
  }

  const acknowledgedEntity = {
    ...currentEntity,
    serverVersion,
    serverStatus,
  };

  if (currentMutation.localRevision === sentMutation.localRevision) {
    return {
      apply: true,
      kind: 'clean',
      entity: {
        ...acknowledgedEntity,
        desiredStatus: serverStatus,
        state: V4_LOCAL_STATES.CLEAN,
      },
      mutation: null,
    };
  }

  const rebasedMutation = rebasePendingMutation(currentMutation, {
    serverVersion,
    serverStatus,
    nowMs,
  });
  if (!rebasedMutation) {
    return {
      apply: true,
      kind: 'clean-after-rebase',
      entity: {
        ...acknowledgedEntity,
        desiredStatus: serverStatus,
        state: V4_LOCAL_STATES.CLEAN,
      },
      mutation: null,
    };
  }

  return {
    apply: true,
    kind: 'rebased',
    entity: {
      ...acknowledgedEntity,
      state: V4_LOCAL_STATES.DIRTY,
    },
    mutation: rebasedMutation,
  };
}
