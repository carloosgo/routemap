import {
  V4_MUTATION_OPERATIONS,
  isV4EntityType,
} from './storageV4Contract.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

export function mutationEntityKey(mutation) {
  const userId = requiredText(mutation?.userId, 'userId');
  const tripId = requiredText(mutation?.tripId, 'tripId');
  const entityId = requiredText(mutation?.entityId, 'entityId');
  if (!isV4EntityType(mutation?.entityType)) {
    throw new TypeError('entityType no pertenece al contrato v4.');
  }
  return `${userId}/${tripId}/${mutation.entityType}/${entityId}`;
}

function mergeOperations(first, next) {
  const create = V4_MUTATION_OPERATIONS.CREATE;
  const update = V4_MUTATION_OPERATIONS.UPDATE;
  const remove = V4_MUTATION_OPERATIONS.DELETE;
  const restore = V4_MUTATION_OPERATIONS.RESTORE;

  if (first.operation === create && next.operation === remove) return null;
  if (first.operation === create) return create;
  if (first.operation === remove && next.operation === restore) return update;
  if (next.operation === restore) return restore;
  if (next.operation === remove) return remove;
  return update;
}

function mergeMutations(first, next) {
  const operation = mergeOperations(first, next);
  if (!operation) return null;
  return {
    ...next,
    operation,
    baseVersion: first.baseVersion,
    createdAtLocal: first.createdAtLocal,
    attempts: 0,
    nextAttemptAt: null,
  };
}

export function coalesceMutationQueue(mutations = []) {
  const order = [];
  const byEntity = new Map();

  for (const mutation of mutations) {
    const key = mutationEntityKey(mutation);
    if (!byEntity.has(key)) {
      order.push(key);
      byEntity.set(key, { ...mutation });
      continue;
    }
    const merged = mergeMutations(byEntity.get(key), mutation);
    if (merged) byEntity.set(key, merged);
    else byEntity.delete(key);
  }

  return order.flatMap((key) => byEntity.has(key) ? [byEntity.get(key)] : []);
}
