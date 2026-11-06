import { V4_ENTITY_STATUS } from './storageV4Contract.js';

function stateOf(entity) {
  if (!entity) return 'missing';
  return entity.status === V4_ENTITY_STATUS.DELETED ? 'deleted' : 'active';
}

function safeValue(entity, valueOf) {
  if (!entity) return 0;
  const value = Number(valueOf(entity));
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('El valor agregado de una entidad debe ser finito y no negativo.');
  }
  return value;
}

export function aggregateDeltaForEntityTransition({
  before = null,
  after = null,
  valueOf = () => 0,
} = {}) {
  const beforeState = stateOf(before);
  const afterState = stateOf(after);
  const beforeValue = safeValue(before, valueOf);
  const afterValue = safeValue(after, valueOf);

  if (beforeState === 'active' && afterState === 'missing') {
    throw new Error('Una entidad activa no puede purgarse sin pasar por deleted.');
  }
  if (beforeState === 'missing' && afterState === 'active') {
    return { countDelta: 1, valueDelta: afterValue };
  }
  if (beforeState === 'active' && afterState === 'active') {
    return { countDelta: 0, valueDelta: afterValue - beforeValue };
  }
  if (beforeState === 'active' && afterState === 'deleted') {
    return { countDelta: -1, valueDelta: -beforeValue };
  }
  if (beforeState === 'deleted' && afterState === 'active') {
    return { countDelta: 1, valueDelta: afterValue };
  }

  return { countDelta: 0, valueDelta: 0 };
}
