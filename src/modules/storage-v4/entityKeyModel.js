import { isV4EntityType } from './storageV4Contract.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  if (normalized.includes('/')) {
    throw new TypeError(`${field} no puede contener '/'.`);
  }
  return normalized;
}

export function v4EntityKey({ userId, tripId, entityType, entityId } = {}) {
  if (!isV4EntityType(entityType)) {
    throw new TypeError('entityType no pertenece al contrato v4.');
  }
  return [
    requiredText(userId, 'userId'),
    requiredText(tripId, 'tripId'),
    entityType,
    requiredText(entityId, 'entityId'),
  ].join('/');
}
