import { Timestamp } from 'firebase-admin/firestore';
import { targetAggregateContribution } from './v4AggregateContributionModel.js';
import { v4SegmentAggregateValue } from './v4SegmentAggregateValue.js';

const RADIX = 36;
const RANK_WIDTH = 10;
const RANK_STEP = 1_000_000;
const COLLECTION_SPECS = Object.freeze([
  ['segments', 'segments', 'segment'],
  ['places', 'places', 'place'],
  ['routeConnections', 'connections', 'connection'],
  ['notes', 'notes', 'note'],
  ['checklist', 'checklist', 'checklist'],
]);

function requiredText(value, field, max = 128) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new TypeError(`${field} inválido para migración.`);
  return text;
}

function timestampFromIso(value, field) {
  const raw = requiredText(value, field, 64);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== raw) {
    throw new TypeError(`${field} no es un ISO timestamp canónico.`);
  }
  return Timestamp.fromDate(date);
}

function initialRank(position) {
  if (!Number.isInteger(position) || position < 0) throw new TypeError('position v3 inválida.');
  return ((position + 1) * RANK_STEP).toString(RADIX).padStart(RANK_WIDTH, '0');
}

function ordered(items, label) {
  const list = Array.isArray(items) ? items : [];
  const seenPositions = new Set();
  const seenIds = new Set();
  const result = [...list].sort((a, b) => Number(a?.position) - Number(b?.position));
  result.forEach((item, index) => {
    if (!Number.isInteger(item?.position) || item.position < 0) {
      throw new TypeError(`${label}.position inválida.`);
    }
    if (seenPositions.has(item.position)) throw new TypeError(`${label} contiene position duplicada.`);
    seenPositions.add(item.position);
    if (item.position !== index) throw new TypeError(`${label} no tiene positions contiguas.`);
    const id = requiredText(item?.id, `${label}.id`);
    if (seenIds.has(id)) throw new TypeError(`${label} contiene id duplicado: ${id}.`);
    seenIds.add(id);
  });
  return result;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function entityLifecycle(createdAt, updatedAt) {
  return {
    status: 'active',
    version: 1,
    createdAt,
    updatedAt,
    deletedAt: null,
  };
}

function segmentDocument(raw, rank, createdAt, updatedAt) {
  return {
    id: requiredText(raw.id, 'segment.id'),
    rank,
    origin: clone(raw.origin ?? null),
    destination: clone(raw.destination ?? null),
    startDate: typeof raw.startDate === 'string' ? raw.startDate : '',
    endDate: typeof raw.endDate === 'string' ? raw.endDate : '',
    expenses: clone(raw.expenses || {}),
    note: typeof raw.note === 'string' ? raw.note : '',
    ...entityLifecycle(createdAt, updatedAt),
  };
}

function placeDocument(raw, rank, createdAt, updatedAt) {
  const provider = raw?.provider === 'google' || raw?.googlePlaceId ? 'google' : 'geoapify';
  const googlePlaceId = provider === 'google'
    ? requiredText(raw.googlePlaceId || raw.id, 'place.googlePlaceId', 256)
    : '';
  const common = {
    id: requiredText(raw.id, 'place.id'),
    rank,
    provider,
    googlePlaceId,
    userLabel: typeof raw.userLabel === 'string' ? raw.userLabel : '',
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    ...entityLifecycle(createdAt, updatedAt),
  };
  if (provider === 'google') {
    return {
      ...common,
      name: '', address: '', city: '', country: '', category: '', countryCode: '',
      lat: null, lon: null,
    };
  }
  return {
    ...common,
    name: typeof raw.name === 'string' ? raw.name : '',
    address: typeof raw.address === 'string' ? raw.address : '',
    city: typeof raw.city === 'string' ? raw.city : '',
    country: typeof raw.country === 'string' ? raw.country : '',
    category: typeof raw.category === 'string' ? raw.category : '',
    countryCode: typeof raw.countryCode === 'string' ? raw.countryCode : '',
    lat: raw.lat ?? null,
    lon: raw.lon ?? null,
  };
}

function connectionDocument(raw, rank, createdAt, updatedAt) {
  return {
    id: requiredText(raw.id, 'connection.id'),
    rank,
    fromPlaceId: requiredText(raw.fromPlaceId, 'connection.fromPlaceId'),
    toPlaceId: requiredText(raw.toPlaceId, 'connection.toPlaceId'),
    mode: typeof raw.mode === 'string' ? raw.mode : 'drive',
    visible: raw.visible !== false,
    ...entityLifecycle(createdAt, updatedAt),
  };
}

function noteDocument(raw, rank, createdAt, updatedAt) {
  return {
    id: requiredText(raw.id, 'note.id'),
    rank,
    title: typeof raw.title === 'string' ? raw.title : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    ...entityLifecycle(createdAt, updatedAt),
  };
}

function checklistDocument(raw, rank, createdAt, updatedAt) {
  return {
    id: requiredText(raw.id, 'checklist.id'),
    rank,
    text: typeof raw.text === 'string' ? raw.text : '',
    done: Boolean(raw.done),
    ...entityLifecycle(createdAt, updatedAt),
  };
}

function materializeEntity(type, raw, rank, createdAt, updatedAt) {
  if (type === 'segment') return segmentDocument(raw, rank, createdAt, updatedAt);
  if (type === 'place') return placeDocument(raw, rank, createdAt, updatedAt);
  if (type === 'connection') return connectionDocument(raw, rank, createdAt, updatedAt);
  if (type === 'note') return noteDocument(raw, rank, createdAt, updatedAt);
  if (type === 'checklist') return checklistDocument(raw, rank, createdAt, updatedAt);
  throw new TypeError('Tipo de entidad de migración desconocido.');
}

function expectedCount(summary, revision, field) {
  const summaryValue = Number(summary?.[field]);
  const revisionValue = Number(revision?.[field]);
  if (!Number.isInteger(summaryValue) || summaryValue < 0 || summaryValue !== revisionValue) {
    throw new TypeError(`${field} v3 no coincide entre summary y revision.`);
  }
  return summaryValue;
}

export function materializePersistedV3ToV4({ summary, revision, collections } = {}) {
  const tripId = requiredText(summary?.id, 'summary.id');
  const activeRevision = requiredText(summary?.activeRevision, 'summary.activeRevision');
  if (Number(summary?.storageVersion) !== 3) throw new TypeError('Solo storageVersion 3 puede migrarse a v4.');
  if (revision?.id !== activeRevision || revision?.complete !== true) {
    throw new TypeError('La revisión v3 activa no está completa o no coincide con el summary.');
  }

  const createdAt = timestampFromIso(summary.createdAt, 'summary.createdAt');
  const updatedAt = timestampFromIso(summary.updatedAt, 'summary.updatedAt');
  const expectedCounts = {
    segments: expectedCount(summary, revision, 'segmentCount'),
    places: expectedCount(summary, revision, 'placeCount'),
    routeConnections: expectedCount(summary, revision, 'routeConnectionCount'),
    notes: expectedCount(summary, revision, 'noteCount'),
    checklist: expectedCount(summary, revision, 'checklistCount'),
  };

  const outputCollections = {};
  for (const [sourceName, targetName, entityType] of COLLECTION_SPECS) {
    const source = ordered(collections?.[sourceName], sourceName);
    if (source.length !== expectedCounts[sourceName]) {
      throw new TypeError(`${sourceName} v3 no coincide con su count declarado.`);
    }
    outputCollections[targetName] = source.map((item, index) => materializeEntity(
      entityType,
      item,
      initialRank(index),
      createdAt,
      updatedAt
    ));
  }

  const placeIds = new Set(outputCollections.places.map((item) => item.id));
  for (const connection of outputCollections.connections) {
    if (!placeIds.has(connection.fromPlaceId) || !placeIds.has(connection.toPlaceId)) {
      throw new TypeError('Una conexión v3 referencia un lugar inexistente.');
    }
  }

  const computedTotal = outputCollections.segments
    .reduce((sum, segment) => sum + v4SegmentAggregateValue(segment), 0);
  const declaredTotal = Number(summary.total);
  if (!Number.isFinite(declaredTotal) || Math.abs(declaredTotal - computedTotal) > 0.000001) {
    throw new TypeError('El total v3 declarado no coincide con los trayectos persistidos.');
  }

  const root = {
    id: tripId,
    name: typeof summary.name === 'string' ? summary.name : '',
    currency: typeof summary.currency === 'string' ? summary.currency : 'USD',
    schemaVersion: 4,
    status: 'active',
    version: 1,
    createdAt,
    updatedAt,
    deletedAt: null,
    purgeAfter: null,
    segmentCount: outputCollections.segments.length,
    placeCount: outputCollections.places.length,
    total: computedTotal,
  };

  const contributions = [];
  for (const segment of outputCollections.segments) {
    contributions.push({
      id: `segment:${encodeURIComponent(segment.id)}`,
      entityId: segment.id,
      ...targetAggregateContribution({
        entityType: 'segment',
        after: segment,
        valueOf: v4SegmentAggregateValue,
      }),
      updatedAt,
    });
  }
  for (const place of outputCollections.places) {
    contributions.push({
      id: `place:${encodeURIComponent(place.id)}`,
      entityId: place.id,
      ...targetAggregateContribution({ entityType: 'place', after: place }),
      updatedAt,
    });
  }

  return {
    source: {
      tripId,
      storageVersion: 3,
      activeRevision,
      sourceUpdatedAt: summary.updatedAt,
    },
    root,
    collections: outputCollections,
    contributions,
  };
}
