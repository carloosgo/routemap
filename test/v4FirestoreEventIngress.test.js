import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_FIRESTORE_DATABASE,
  V4_FIRESTORE_EVENT_TYPE,
  handleV4FirestoreEventIngress,
  parseV4FirestoreEventHeaders,
} from '../functions/v4FirestoreEventIngressHandler.js';
import { createV4FirestoreEventIngressFunction } from '../functions/v4FirestoreEventIngressFunction.js';

function headers(document, overrides = {}) {
  return {
    'ce-id': 'event-123',
    'ce-specversion': '1.0',
    'ce-type': V4_FIRESTORE_EVENT_TYPE,
    'ce-source': '//firestore.googleapis.com/projects/atlasmap-dev/databases/(default)',
    'ce-database': V4_FIRESTORE_DATABASE,
    'ce-document': document,
    ...overrides,
  };
}

function fakeDb(data, exists = true) {
  const reads = [];
  return {
    reads,
    doc(path) {
      reads.push(path);
      return {
        async get() {
          return { exists, data: () => data };
        },
      };
    },
  };
}

test('ingress usa ce-document/ce-database y clasifica root, aggregate y touch', () => {
  const root = parseV4FirestoreEventHeaders(headers(
    'users/alice/trips/trip-1'
  ));
  assert.equal(root.entityType, 'origin');
  assert.equal(root.entityId, 'trip-1');
  assert.equal(root.collection, 'trips');
  assert.equal(root.mode, 'aggregate');
  assert.equal(root.documentPath, 'users/alice/trips/trip-1');

  const segment = parseV4FirestoreEventHeaders(headers(
    'users/alice/trips/trip-1/segments/seg-1'
  ));
  assert.equal(segment.entityType, 'segment');
  assert.equal(segment.mode, 'aggregate');
  assert.equal(segment.database, '(default)');
  assert.equal(segment.documentPath, 'users/alice/trips/trip-1/segments/seg-1');

  const note = parseV4FirestoreEventHeaders(headers(
    'documents/users/alice/trips/trip-1/notes/note-1'
  ));
  assert.equal(note.entityType, 'note');
  assert.equal(note.mode, 'touch');

  assert.throws(() => parseV4FirestoreEventHeaders(headers(
    'users/alice/profile/private/value'
  )), /fuera del árbol/);
  assert.throws(() => parseV4FirestoreEventHeaders(headers(
    'users/alice/trips/trip-1/segments/seg-1',
    { 'ce-database': 'otra-db' }
  )), /ce-database/);
  assert.throws(() => parseV4FirestoreEventHeaders(headers(
    'users/alice/trips/trip-1/segments/seg-1',
    { 'ce-document': '' }
  )), /ce-document/);
});

test('aggregate relee el documento autoritativo y no confía en payload protobuf', async () => {
  const after = { id: 'seg-1', version: 8, status: 'active' };
  const db = fakeDb(after);
  let input;
  const result = await handleV4FirestoreEventIngress({
    db,
    headers: headers('users/alice/trips/trip-1/segments/seg-1'),
    applyAggregate: async (value) => {
      input = value;
      return { applied: true };
    },
    applyTouch: async () => { throw new Error('no debe ejecutarse'); },
  });

  assert.deepEqual(db.reads, ['users/alice/trips/trip-1/segments/seg-1']);
  assert.equal(input.userId, 'alice');
  assert.equal(input.tripId, 'trip-1');
  assert.equal(input.entityId, 'seg-1');
  assert.equal(input.entityType, 'segment');
  assert.equal(input.before, null);
  assert.equal(input.after, after);
  assert.equal(result.processed, true);
});

test('root relee originDetails y entra por el agregado existente', async () => {
  const after = {
    id: 'trip-1',
    version: 9,
    status: 'active',
    originDetails: { departureDate: '2026-12-01', expenses: {} },
  };
  const db = fakeDb(after);
  let input;
  await handleV4FirestoreEventIngress({
    db,
    headers: headers('users/alice/trips/trip-1'),
    applyAggregate: async (value) => { input = value; return { applied: true }; },
    applyTouch: async () => { throw new Error('no debe ejecutarse'); },
  });
  assert.deepEqual(db.reads, ['users/alice/trips/trip-1']);
  assert.equal(input.entityType, 'origin');
  assert.equal(input.entityId, 'trip-1');
  assert.equal(input.after, after);
});

test('touch usa el estado actual y missing físico se trata como cleanup/purge', async () => {
  const after = { id: 'note-1', version: 3, status: 'active', updatedAt: new Date() };
  const db = fakeDb(after);
  let input;
  await handleV4FirestoreEventIngress({
    db,
    headers: headers('users/alice/trips/trip-1/notes/note-1'),
    applyAggregate: async () => { throw new Error('no debe ejecutarse'); },
    applyTouch: async (value) => { input = value; return { applied: true }; },
  });
  assert.equal(input.entityType, 'note');
  assert.equal(input.after, after);

  const missing = fakeDb(null, false);
  const result = await handleV4FirestoreEventIngress({
    db: missing,
    headers: headers('users/alice/trips/trip-1/checklist/item-1'),
    applyAggregate: async () => { throw new Error('no debe ejecutarse'); },
    applyTouch: async () => { throw new Error('no debe ejecutarse'); },
  });
  assert.equal(result.processed, false);
  assert.equal(result.reason, 'document-missing');
});

test('HTTPS ingress queda privado y responde 204 al reconciliar', async () => {
  let options;
  let httpHandler;
  const fn = createV4FirestoreEventIngressFunction({
    adminDb: {},
    requestFactory: (value, handler) => {
      options = value;
      httpHandler = handler;
      return { deployed: true };
    },
    ingressHandler: async () => ({
      eventId: 'event-1',
      entityType: 'segment',
      documentPath: 'users/a/trips/t/segments/s',
      processed: true,
    }),
    reportInfo: () => {},
    reportError: () => {},
  });

  assert.deepEqual(fn, { deployed: true });
  assert.equal(options.region, 'us-central1');
  assert.equal(options.invoker, 'private');
  assert.equal(options.cors, false);

  const calls = [];
  await httpHandler({ headers: {} }, {
    status(code) { calls.push(['status', code]); return this; },
    end() { calls.push(['end']); },
    json(value) { calls.push(['json', value]); },
  });
  assert.deepEqual(calls, [['status', 204], ['end']]);
});
