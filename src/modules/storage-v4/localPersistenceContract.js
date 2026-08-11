import {
  V4_ENTITY_STATUS,
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from './storageV4Contract.js';
import { v4EntityKey } from './entityKeyModel.js';
import {
  V4_SERVER_STATUS,
  pendingMutationOperation,
} from './pendingMutationModel.js';

const LOCAL_STATE_VALUES = new Set(Object.values(V4_LOCAL_STATES));
const OPERATION_VALUES = new Set(Object.values(V4_MUTATION_OPERATIONS));
const SERVER_STATUS_VALUES = new Set(Object.values(V4_SERVER_STATUS));
const DESIRED_STATUS_VALUES = new Set(Object.values(V4_ENTITY_STATUS));

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} debe ser un entero no negativo.`);
  }
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${field} debe ser un entero positivo.`);
  }
  return value;
}

function oneOf(value, allowed, field) {
  if (!allowed.has(value)) throw new TypeError(`${field} inválido.`);
  return value;
}

function clonePayload(payload) {
  if (payload === undefined || payload === null) return null;
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(payload);
  }
  return JSON.parse(JSON.stringify(payload));
}

export function normalizeDraftRecord(record) {
  const scopeId = requiredText(record?.scopeId, 'scopeId');
  const draftId = requiredText(record?.draftId, 'draftId');
  return {
    key: `${scopeId}/${draftId}`,
    scopeId,
    draftId,
    payload: clonePayload(record.payload),
    lastModifiedLocal: nonNegativeInteger(
      record.lastModifiedLocal ?? 0,
      'lastModifiedLocal'
    ),
  };
}

export function normalizeLocalEntityRecord(record) {
  const key = v4EntityKey(record);
  const serverVersion = nonNegativeInteger(record.serverVersion ?? 0, 'serverVersion');
  const serverStatus = oneOf(record.serverStatus, SERVER_STATUS_VALUES, 'serverStatus');
  if ((serverVersion === 0) !== (serverStatus === V4_SERVER_STATUS.MISSING)) {
    throw new TypeError('serverVersion y serverStatus son inconsistentes.');
  }
  return {
    key,
    userId: requiredText(record.userId, 'userId'),
    tripId: requiredText(record.tripId, 'tripId'),
    entityType: record.entityType,
    entityId: requiredText(record.entityId, 'entityId'),
    payload: clonePayload(record.payload),
    serverVersion,
    serverStatus,
    desiredStatus: oneOf(record.desiredStatus, DESIRED_STATUS_VALUES, 'desiredStatus'),
    localRevision: nonNegativeInteger(record.localRevision ?? 0, 'localRevision'),
    state: oneOf(record.state, LOCAL_STATE_VALUES, 'state'),
    lastModifiedLocal: nonNegativeInteger(
      record.lastModifiedLocal ?? 0,
      'lastModifiedLocal'
    ),
  };
}

export function normalizeMutationRecord(record) {
  const entityKey = v4EntityKey(record);
  const operation = oneOf(record.operation, OPERATION_VALUES, 'operation');
  const baseVersion = nonNegativeInteger(record.baseVersion ?? 0, 'baseVersion');
  const baseStatus = oneOf(record.baseStatus, SERVER_STATUS_VALUES, 'baseStatus');
  const desiredStatus = oneOf(record.desiredStatus, DESIRED_STATUS_VALUES, 'desiredStatus');
  const expectedOperation = pendingMutationOperation({
    baseVersion,
    baseStatus,
    desiredStatus,
  });
  if (expectedOperation !== operation) {
    throw new TypeError('operation no coincide con la transición pendiente.');
  }
  return {
    entityKey,
    userId: requiredText(record.userId, 'userId'),
    tripId: requiredText(record.tripId, 'tripId'),
    entityType: record.entityType,
    entityId: requiredText(record.entityId, 'entityId'),
    operation,
    baseVersion,
    baseStatus,
    desiredStatus,
    localRevision: positiveInteger(record.localRevision, 'localRevision'),
    payload: clonePayload(record.payload),
    createdAtLocal: nonNegativeInteger(record.createdAtLocal ?? 0, 'createdAtLocal'),
    updatedAtLocal: nonNegativeInteger(record.updatedAtLocal ?? 0, 'updatedAtLocal'),
    attempts: nonNegativeInteger(record.attempts ?? 0, 'attempts'),
    nextAttemptAt: record.nextAttemptAt == null
      ? null
      : nonNegativeInteger(record.nextAttemptAt, 'nextAttemptAt'),
  };
}

export function assertLocalPersistenceAdapter(adapter) {
  const methods = [
    'getDraft',
    'putDraft',
    'deleteDraft',
    'getEntity',
    'putEntity',
    'listEntities',
    'getMutation',
    'putMutation',
    'listMutations',
    'deleteMutationIfRevision',
    'tryAcquireSyncLease',
    'releaseSyncLeaseIfOwned',
    'clearUserData',
  ];
  for (const method of methods) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`El adaptador local v4 requiere ${method}().`);
    }
  }
  return adapter;
}
