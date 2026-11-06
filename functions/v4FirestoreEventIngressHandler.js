import { applyV4AggregateEvent } from './v4AggregateStore.js';
import { applyV4TripTouch } from './v4TripTouchStore.js';

export const V4_FIRESTORE_EVENT_TYPE = 'google.cloud.firestore.document.v1.written';
export const V4_FIRESTORE_DATABASE = '(default)';

const ENTITY_ROUTES = Object.freeze({
  segments: Object.freeze({ entityType: 'segment', mode: 'aggregate' }),
  places: Object.freeze({ entityType: 'place', mode: 'aggregate' }),
  connections: Object.freeze({ entityType: 'connection', mode: 'touch' }),
  notes: Object.freeze({ entityType: 'note', mode: 'touch' }),
  checklist: Object.freeze({ entityType: 'checklist', mode: 'touch' }),
});

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim() : '';
}

function decodePathSegment(value, field) {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded.includes('/')) throw new TypeError(`${field} inválido.`);
    return decoded;
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError(`${field} inválido.`);
  }
}

export function parseV4FirestoreEventHeaders(headers = {}) {
  const type = headerValue(headers, 'ce-type');
  const source = headerValue(headers, 'ce-source');
  const database = headerValue(headers, 'ce-database');
  const document = headerValue(headers, 'ce-document');
  const eventId = headerValue(headers, 'ce-id');
  const specVersion = headerValue(headers, 'ce-specversion');

  if (type !== V4_FIRESTORE_EVENT_TYPE) {
    throw new TypeError('Evento Firestore v4 con ce-type inválido.');
  }
  if (database !== V4_FIRESTORE_DATABASE) {
    throw new TypeError('Evento Firestore v4 con ce-database inválido.');
  }
  if (specVersion !== '1.0') {
    throw new TypeError('Evento Firestore v4 con ce-specversion inválido.');
  }
  if (!eventId) throw new TypeError('Evento Firestore v4 sin ce-id.');
  if (!source) throw new TypeError('Evento Firestore v4 sin ce-source.');
  if (!document) throw new TypeError('Evento Firestore v4 sin ce-document.');

  const normalizedDocument = document.startsWith('documents/')
    ? document.slice('documents/'.length)
    : document;
  const parts = normalizedDocument.split('/');
  if (parts[0] !== 'users' || parts[2] !== 'trips') {
    throw new TypeError('Evento Firestore v4 fuera del árbol de viajes soportado.');
  }

  const userId = decodePathSegment(parts[1], 'userId');
  const tripId = decodePathSegment(parts[3], 'tripId');

  if (parts.length === 4) {
    const documentPath = `users/${userId}/trips/${tripId}`;
    return Object.freeze({
      eventId,
      type,
      source,
      database,
      document,
      documentPath,
      collection: 'trips',
      userId,
      tripId,
      entityId: tripId,
      entityType: 'origin',
      mode: 'aggregate',
    });
  }

  if (parts.length !== 6) {
    throw new TypeError('Evento Firestore v4 fuera del árbol de viajes soportado.');
  }
  const collection = parts[4];
  const route = ENTITY_ROUTES[collection];
  if (!route) throw new TypeError('Evento Firestore v4 para colección no soportada.');

  const entityId = decodePathSegment(parts[5], 'entityId');
  const documentPath = `users/${userId}/trips/${tripId}/${collection}/${entityId}`;

  return Object.freeze({
    eventId,
    type,
    source,
    database,
    document,
    documentPath,
    collection,
    userId,
    tripId,
    entityId,
    entityType: route.entityType,
    mode: route.mode,
  });
}

/**
 * Reconciles the latest authoritative Firestore state for a Storage v4 document.
 *
 * Eventarc delivery is at-least-once and may be out of order. Instead of
 * trusting the protobuf payload snapshot, the ingress re-reads the current
 * document. Aggregate contribution/version fences and monotonic touch timestamps
 * then make duplicate or stale deliveries safe. Trip-root events contribute the
 * origin expenses; child events preserve their existing aggregate/touch routes.
 */
export async function handleV4FirestoreEventIngress({
  db,
  headers,
  applyAggregate = applyV4AggregateEvent,
  applyTouch = applyV4TripTouch,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (typeof applyAggregate !== 'function') throw new TypeError('applyAggregate debe ser función.');
  if (typeof applyTouch !== 'function') throw new TypeError('applyTouch debe ser función.');

  const event = parseV4FirestoreEventHeaders(headers);
  const snapshot = await db.doc(event.documentPath).get();

  // Storage v4 uses tombstones for normal deletes. A physically missing document
  // is purge/cleanup work and has no aggregate/touch value to apply.
  if (!snapshot.exists) {
    return Object.freeze({
      processed: false,
      skipped: true,
      reason: 'document-missing',
      eventId: event.eventId,
      documentPath: event.documentPath,
      entityType: event.entityType,
    });
  }

  const after = snapshot.data();
  if (!after || typeof after !== 'object') {
    throw new TypeError('El documento Firestore v4 no contiene datos válidos.');
  }

  const result = event.mode === 'aggregate'
    ? await applyAggregate({
      db,
      userId: event.userId,
      tripId: event.tripId,
      entityId: event.entityId,
      entityType: event.entityType,
      before: null,
      after,
    })
    : await applyTouch({
      db,
      userId: event.userId,
      tripId: event.tripId,
      entityId: event.entityId,
      entityType: event.entityType,
      after,
    });

  return Object.freeze({
    processed: true,
    skipped: false,
    eventId: event.eventId,
    documentPath: event.documentPath,
    entityType: event.entityType,
    result,
  });
}
