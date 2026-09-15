import { v4EntityKey } from './entityKeyModel.js';
import { upsertPendingMutation } from './pendingMutationModel.js';
import {
  V4_ENTITY_STATUS,
  V4_LOCAL_STATES,
} from './storageV4Contract.js';

function desiredStatus(value) {
  if (value !== V4_ENTITY_STATUS.ACTIVE && value !== V4_ENTITY_STATUS.DELETED) {
    throw new TypeError('desiredStatus inválido.');
  }
  return value;
}

function serverVersion(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('serverVersion debe ser un entero no negativo.');
  }
  return value;
}

function serverStatus(value) {
  if (value !== 'missing' && value !== 'active' && value !== 'deleted') {
    throw new TypeError('serverStatus inválido.');
  }
  return value;
}

export function planLocalEntityIntent({
  currentEntity = null,
  currentMutation = null,
  intent,
  nowMs,
} = {}) {
  const entityKey = v4EntityKey(intent);
  if (currentEntity && currentEntity.key !== entityKey) {
    throw new TypeError('La entidad actual no coincide con la intención local.');
  }
  if (currentMutation && currentMutation.entityKey !== entityKey) {
    throw new TypeError('La mutación actual no coincide con la intención local.');
  }
  if (currentEntity?.state === V4_LOCAL_STATES.CONFLICT) {
    throw new Error('Un conflicto requiere resolución explícita antes de editar.');
  }

  const baseVersion = currentEntity
    ? currentEntity.serverVersion
    : serverVersion(intent.serverVersion ?? 0);
  const baseStatus = currentEntity
    ? currentEntity.serverStatus
    : serverStatus(intent.serverStatus ?? 'missing');
  if ((baseVersion === 0) !== (baseStatus === 'missing')) {
    throw new TypeError('serverVersion y serverStatus son inconsistentes.');
  }

  const nextDesiredStatus = desiredStatus(intent.desiredStatus);
  const localRevision = (currentEntity?.localRevision ?? 0) + 1;
  const payload = intent.payload == null && currentEntity
    ? currentEntity.payload
    : intent.payload ?? null;

  const mutation = upsertPendingMutation({
    previous: currentMutation,
    intent: {
      ...intent,
      baseVersion,
      baseStatus,
      desiredStatus: nextDesiredStatus,
      localRevision,
      payload: nextDesiredStatus === V4_ENTITY_STATUS.DELETED ? null : payload,
    },
    nowMs,
  });

  if (!mutation && baseStatus === 'missing') {
    return {
      entityKey,
      discarded: true,
      entity: null,
      mutation: null,
    };
  }

  return {
    entityKey,
    discarded: false,
    entity: {
      userId: intent.userId,
      tripId: intent.tripId,
      entityType: intent.entityType,
      entityId: intent.entityId,
      payload,
      serverVersion: baseVersion,
      serverStatus: baseStatus,
      desiredStatus: nextDesiredStatus,
      localRevision,
      state: mutation ? V4_LOCAL_STATES.DIRTY : V4_LOCAL_STATES.CLEAN,
      conflict: null,
      lastModifiedLocal: nowMs,
    },
    mutation,
  };
}
