export const STORAGE_V4_VERSION = 4;

export const V4_ENTITY_TYPES = Object.freeze([
  'trip',
  'segment',
  'place',
  'connection',
  'note',
  'checklist',
]);

export const V4_ENTITY_STATUS = Object.freeze({
  ACTIVE: 'active',
  DELETED: 'deleted',
});

export const V4_MUTATION_OPERATIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
});

export const V4_LOCAL_STATES = Object.freeze({
  CLEAN: 'clean',
  DIRTY: 'dirty',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
  ERROR: 'error',
});

export function isV4EntityType(value) {
  return V4_ENTITY_TYPES.includes(value);
}
