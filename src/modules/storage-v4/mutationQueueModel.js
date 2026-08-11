import { V4_MUTATION_OPERATIONS } from './storageV4Contract.js';
import { v4EntityKey } from './entityKeyModel.js';

const VALID_OPERATIONS = new Set(Object.values(V4_MUTATION_OPERATIONS));

export function mutationEntityKey(mutation) {
  if (!VALID_OPERATIONS.has(mutation?.operation)) {
    throw new TypeError('operation no pertenece al contrato v4.');
  }
  return v4EntityKey(mutation);
}

function safeMergedOperation(first, next) {
  const { CREATE, UPDATE, RESTORE, DELETE } = V4_MUTATION_OPERATIONS;
  if (first.operation === CREATE && next.operation === UPDATE) return CREATE;
  if (first.operation === UPDATE && next.operation === UPDATE) return UPDATE;
  if (first.operation === RESTORE && next.operation === UPDATE) return RESTORE;
  if (first.operation === DELETE && next.operation === DELETE) return DELETE;
  return null;
}

function mergeMutations(first, next, operation) {
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
  const result = [];
  const latestIndexByEntity = new Map();

  for (const mutation of mutations) {
    const key = mutationEntityKey(mutation);
    const previousIndex = latestIndexByEntity.get(key);
    const previous = previousIndex == null ? null : result[previousIndex];
    const operation = previous ? safeMergedOperation(previous, mutation) : null;

    if (operation) {
      result[previousIndex] = mergeMutations(previous, mutation, operation);
      continue;
    }

    latestIndexByEntity.set(key, result.length);
    result.push({ ...mutation });
  }

  return result;
}
