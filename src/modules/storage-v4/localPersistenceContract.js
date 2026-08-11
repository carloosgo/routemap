import {
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from './storageV4Contract.js';
import { v4EntityKey } from './entityKeyModel.js';

const LOCAL_STATE_VALUES = new Set(Object.values(V4_LOCAL_STATES));
const OPERATION_VALUES = new Set(Object.values(V4_MUTATION_OPERATIONS));

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

function clonePayload(payload) {
  if (payload === undefined || payload === null) return null;
  if (typeof structuredClone === 'function') return structuredClone(payload);
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
  if (!LOCAL_STATE_VALUES.has(record?.state)) {
    throw new TypeError('state local no pertenece al contrato v4.');
  }
  return {
    key,
    userId: requiredText(record.userId, 'userId'),
    tripId: requiredText(record.tripId, 'tripId'),
    entityType: record.entityType,
    entityId: requiredText(record.entityId, 'entityId'),
    payload: clonePayload(record.payload),
    serverVersion: nonNegativeInteger(record.serverVersion ?? 0, 'serverVersion'),
    localRevision: nonNegativeInteger(record.localRevision ?? 0, 'localRevision'),
    state: record.state,
    lastModifiedLocal: nonNegativeInteger(
      record.lastModifiedLocal ?? 0,
      'lastModifiedLocal'
    ),
  };
}

export function normalizeMutationRecord(record) {
  const entityKey = v4EntityKey(record);
  if (!OPERATION_VALUES.has(record?.operation)) {
    throw new TypeError('operation no pertenece al contrato v4.');
  }
  const mutationId = requiredText(record?.mutationId, 'mutationId');
  return {
    mutationId,
    entityKey,
    userId: requiredText(record.userId, 'userId'),
    tripId: requiredText(record.tripId, 'tripId'),
    entityType: record.entityType,
    entityId: requiredText(record.entityId, 'entityId'),
    operation: record.operation,
    baseVersion: nonNegativeInteger(record.baseVersion ?? 0, 'baseVersion'),
    payload: clonePayload(record.payload),
    createdAtLocal: nonNegativeInteger(record.createdAtLocal ?? 0, 'createdAtLocal'),
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
    'deleteMutationIfMatch',
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
