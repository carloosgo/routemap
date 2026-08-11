import { tripTotal, normalizeTrip } from '../trips/tripModel.js';
import { v4EntityCreateDocument } from '../../infrastructure/firebase/v4EntityDocuments.js';
import { v4TripCreateDocument } from '../../infrastructure/firebase/v4TripDocument.js';
import { initialRankForPosition } from './rankModel.js';

export const V4_MIGRATION_COLLECTIONS = Object.freeze([
  'segments',
  'places',
  'connections',
  'notes',
  'checklist',
]);

const ENTITY_SOURCES = Object.freeze([
  ['segments', 'segment', 'segments'],
  ['places', 'place', 'places'],
  ['connections', 'connection', 'routeConnections'],
  ['notes', 'note', 'notes'],
  ['checklist', 'checklist', 'checklist'],
]);

function requiredTimestampSource(value, field, timestampFromIso) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new TypeError(`${field} v3 es obligatorio para migración.`);
  const timestamp = timestampFromIso(raw);
  if (timestamp == null) throw new TypeError(`${field} v3 no pudo convertirse a timestamp.`);
  return timestamp;
}

function requireUniqueIds(items, collectionName) {
  const ids = new Set();
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id) throw new TypeError(`${collectionName} contiene una entidad sin id estable.`);
    if (ids.has(id)) throw new TypeError(`${collectionName} contiene id duplicado: ${id}.`);
    ids.add(id);
  }
}

function materializeCollection(entityType, items, createdAt, updatedAt) {
  requireUniqueIds(items, entityType);
  return items.map((item, position) => ({
    ...v4EntityCreateDocument(
      entityType,
      item,
      initialRankForPosition(position),
      createdAt
    ),
    updatedAt,
  }));
}

export function materializeV3TripToV4(rawTrip, { timestampFromIso } = {}) {
  if (typeof timestampFromIso !== 'function') {
    throw new TypeError('timestampFromIso debe ser función.');
  }
  const trip = normalizeTrip(rawTrip);
  if (!trip.id) throw new TypeError('El viaje v3 requiere id estable para migración.');

  const createdAt = requiredTimestampSource(trip.createdAt, 'createdAt', timestampFromIso);
  const updatedAt = requiredTimestampSource(trip.updatedAt, 'updatedAt', timestampFromIso);
  const collections = {};

  for (const [targetName, entityType, sourceName] of ENTITY_SOURCES) {
    const source = Array.isArray(trip[sourceName]) ? trip[sourceName] : [];
    collections[targetName] = materializeCollection(
      entityType,
      source,
      createdAt,
      updatedAt
    );
  }

  const root = {
    ...v4TripCreateDocument(trip, createdAt),
    updatedAt,
    segmentCount: collections.segments.length,
    placeCount: collections.places.length,
    total: tripTotal(trip),
  };

  return {
    source: {
      tripId: trip.id,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    },
    root,
    collections,
  };
}
