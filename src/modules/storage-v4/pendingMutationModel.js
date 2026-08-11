import {
  V4_ENTITY_STATUS,
  V4_MUTATION_OPERATIONS,
} from './storageV4Contract.js';
import { v4EntityKey } from './entityKeyModel.js';

export const V4_SERVER_STATUS = Object.freeze({
  MISSING: 'missing',
  ACTIVE: V4_ENTITY_STATUS.ACTIVE,
  DELETED: V4_ENTITY_STATUS.DELETED,
});

const SERVER_STATUSES = new Set(Object.values(V4_SERVER_STATUS));

function requireVersion(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('baseVersion debe ser un entero no negativo.');
  }
  return value;
}

function requireLocalRevision(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('localRevision debe ser un entero positivo.');
  }
  return value;
}

function requireStatus(value, label) {
  if (!SERVER_STATUSES.has(value)) throw new TypeError(`${label} inválido.`);
  return value;
}

function clone(value) {
  if (value == null) return null;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function pendingMutationOperation({ baseVersion, baseStatus, desiredStatus }) {
  const version = requireVersion(baseVersion);
  const base = requireStatus(baseStatus, 'baseStatus');
  const desired = requireStatus(desiredStatus, 'desiredStatus');
  if (desired === V4_SERVER_STATUS.MISSING) {
    throw new TypeError('desiredStatus no puede ser missing.');
  }
  if ((version === 0) !== (base === V4_SERVER_STATUS.MISSING)) {
    throw new TypeError('baseVersion y baseStatus son inconsistentes.');
  }

  if (base === V4_SERVER_STATUS.MISSING) {
    return desired === V4_SERVER_STATUS.ACTIVE
      ? V4_MUTATION_OPERATIONS.CREATE
      : null;
  }
  if (base === V4_SERVER_STATUS.ACTIVE) {
    return desired === V4_SERVER_STATUS.DELETED
      ? V4_MUTATION_OPERATIONS.DELETE
      : V4_MUTATION_OPERATIONS.UPDATE;
  }
  return desired === V4_SERVER_STATUS.ACTIVE
    ? V4_MUTATION_OPERATIONS.RESTORE
    : null;
}

export function upsertPendingMutation({ previous = null, intent, nowMs }) {
  const entityKey = v4EntityKey(intent);
  if (previous && previous.entityKey !== entityKey) {
    throw new TypeError('No se pueden fusionar intenciones de entidades distintas.');
  }
  const baseVersion = previous?.baseVersion ?? requireVersion(intent.baseVersion);
  const baseStatus = previous?.baseStatus ?? requireStatus(intent.baseStatus, 'baseStatus');
  const desiredStatus = requireStatus(intent.desiredStatus, 'desiredStatus');
  const localRevision = requireLocalRevision(intent.localRevision);
  const operation = pendingMutationOperation({ baseVersion, baseStatus, desiredStatus });
  if (!operation) return null;

  return {
    entityKey,
    userId: intent.userId,
    tripId: intent.tripId,
    entityType: intent.entityType,
    entityId: intent.entityId,
    operation,
    baseVersion,
    baseStatus,
    desiredStatus,
    localRevision,
    payload: clone(intent.payload),
    createdAtLocal: previous?.createdAtLocal ?? nowMs,
    updatedAtLocal: nowMs,
    attempts: 0,
    nextAttemptAt: null,
  };
}

export function rebasePendingMutation(record, { serverVersion, serverStatus, nowMs }) {
  if (!record) return null;
  return upsertPendingMutation({
    intent: {
      ...record,
      baseVersion: requireVersion(serverVersion),
      baseStatus: requireStatus(serverStatus, 'serverStatus'),
    },
    nowMs,
  });
}
