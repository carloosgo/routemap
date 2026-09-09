import {
  TRIP_LIMITS,
  createPlace,
  createSegment,
  placeForPersistence,
} from '../../modules/trips/tripModel.js';
import { createSavedPlaceRoute } from '../../modules/routes/routeModel.js';
import { sanitizeText } from '../../shared/utils.js';
import { V4_ENTITY_STATUS } from '../../modules/storage-v4/storageV4Contract.js';
import { nextEntityVersion } from '../../modules/storage-v4/entityVersionModel.js';

const COLLECTIONS = Object.freeze({
  segment: 'segments',
  place: 'places',
  connection: 'connections',
  note: 'notes',
  checklist: 'checklist',
});

function requireId(value) {
  const id = typeof value === 'string' ? value.trim().slice(0, 128) : '';
  if (!id) throw new TypeError('La entidad v4 requiere id.');
  return id;
}

function requireRank(value) {
  if (typeof value !== 'string' || !/^[0-9a-z]{10}$/.test(value)) {
    throw new TypeError('La entidad v4 requiere un rank válido.');
  }
  return value;
}

function parsedDayPlan(value) {
  if (typeof value !== 'string' || !value) return [];
  return value.split(',').map(Number).filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= 36600);
}

function persistedSegment(rawEntity) {
  const segment = createSegment({
    ...rawEntity,
    tripDayOffsets: Array.isArray(rawEntity?.tripDayOffsets)
      ? rawEntity.tripDayOffsets
      : parsedDayPlan(rawEntity?.tripDayPlan),
  });
  const { tripDayOffsets, ...payload } = segment;
  return {
    ...payload,
    tripDayPlan: (tripDayOffsets || []).join(','),
  };
}

export function v4EntityPayload(entityType, rawEntity, rank) {
  if (entityType === 'segment') {
    return { ...persistedSegment(rawEntity), id: requireId(rawEntity?.id), rank: requireRank(rank) };
  }
  if (entityType === 'place') {
    const place = placeForPersistence(createPlace(rawEntity));
    return { ...place, id: requireId(rawEntity?.id), rank: requireRank(rank) };
  }
  if (entityType === 'connection') {
    const route = createSavedPlaceRoute(rawEntity);
    return {
      id: requireId(rawEntity?.id),
      rank: requireRank(rank),
      fromPlaceId: route.fromPlaceId,
      toPlaceId: route.toPlaceId,
      mode: route.mode,
      visible: route.visible,
    };
  }
  if (entityType === 'note') {
    return {
      id: requireId(rawEntity?.id),
      rank: requireRank(rank),
      title: sanitizeText(rawEntity?.title || '', TRIP_LIMITS.noteTitle),
      text: sanitizeText(rawEntity?.text || '', TRIP_LIMITS.noteText),
    };
  }
  if (entityType === 'checklist') {
    return {
      id: requireId(rawEntity?.id),
      rank: requireRank(rank),
      text: sanitizeText(rawEntity?.text || '', TRIP_LIMITS.checklistText),
      done: Boolean(rawEntity?.done),
    };
  }
  throw new TypeError('Tipo de entidad v4 no persistible.');
}

export function v4EntityCollection(entityType) {
  const collectionName = COLLECTIONS[entityType];
  if (!collectionName) throw new TypeError('Tipo de entidad v4 no persistible.');
  return collectionName;
}

export function v4EntityCreateDocument(entityType, rawEntity, rank, timestampValue) {
  return {
    ...v4EntityPayload(entityType, rawEntity, rank),
    status: V4_ENTITY_STATUS.ACTIVE,
    version: 1,
    createdAt: timestampValue,
    updatedAt: timestampValue,
    deletedAt: null,
  };
}

export function v4EntityUpdatePatch(entityType, rawEntity, rank, baseVersion, timestampValue, fieldMask = null) {
  const payload = v4EntityPayload(entityType, rawEntity, rank);
  const selected = Array.isArray(fieldMask) && fieldMask.length
    ? Object.fromEntries(fieldMask.filter((field) => Object.hasOwn(payload, field)).map((field) => [field, payload[field]]))
    : payload;
  return {
    ...selected,
    status: V4_ENTITY_STATUS.ACTIVE,
    version: nextEntityVersion(baseVersion),
    updatedAt: timestampValue,
    deletedAt: null,
  };
}

export function v4EntityDeletePatch(baseVersion, timestampValue) {
  return {
    status: V4_ENTITY_STATUS.DELETED,
    version: nextEntityVersion(baseVersion),
    updatedAt: timestampValue,
    deletedAt: timestampValue,
  };
}

export function v4EntityRestorePatch(baseVersion, timestampValue, { entityType = null, rawEntity = null, rank = null } = {}) {
  return {
    ...(entityType && rawEntity ? v4EntityPayload(entityType, rawEntity, rank) : {}),
    status: V4_ENTITY_STATUS.ACTIVE,
    version: nextEntityVersion(baseVersion),
    updatedAt: timestampValue,
    deletedAt: null,
  };
}
