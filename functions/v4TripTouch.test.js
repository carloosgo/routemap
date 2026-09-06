import test from 'node:test';
import assert from 'node:assert/strict';
import { applyV4TripTouch } from './v4TripTouchStore.js';
import { createV4TripTouchTriggers } from './v4TripTouchTriggers.js';

function timestamp(millis) {
  return {
    toMillis() {
      return millis;
    },
  };
}

function fakeDb(initialRoot) {
  const state = { root: initialRoot ? { ...initialRoot } : null };
  return {
    state,
    doc(path) {
      return { path };
    },
    async runTransaction(callback) {
      const transaction = {
        async get() {
          return {
            exists: Boolean(state.root),
            data() {
              return state.root;
            },
          };
        },
        update(_ref, patch) {
          state.root = { ...state.root, ...patch };
        },
      };
      return callback(transaction);
    },
  };
}

test('touch de nota avanza updatedAt sin incrementar version ni alterar agregados', async () => {
  const db = fakeDb({
    id: 'trip-1',
    schemaVersion: 4,
    status: 'active',
    version: 7,
    segmentCount: 3,
    placeCount: 5,
    total: 120,
    updatedAt: timestamp(1000),
  });
  const childTimestamp = timestamp(2000);

  const result = await applyV4TripTouch({
    db,
    userId: 'alice',
    tripId: 'trip-1',
    entityId: 'note-1',
    entityType: 'note',
    after: {
      id: 'note-1',
      status: 'active',
      version: 4,
      updatedAt: childTimestamp,
    },
  });

  assert.equal(result.applied, true);
  assert.equal(db.state.root.updatedAt, childTimestamp);
  assert.equal(db.state.root.version, 7);
  assert.equal(db.state.root.segmentCount, 3);
  assert.equal(db.state.root.placeCount, 5);
  assert.equal(db.state.root.total, 120);
});

test('touch duplicado o fuera de orden nunca retrasa ni vuelve a avanzar updatedAt', async () => {
  const currentTimestamp = timestamp(3000);
  const db = fakeDb({
    schemaVersion: 4,
    status: 'active',
    version: 2,
    updatedAt: currentTimestamp,
  });

  const result = await applyV4TripTouch({
    db,
    userId: 'alice',
    tripId: 'trip-1',
    entityId: 'check-1',
    entityType: 'checklist',
    after: {
      id: 'check-1',
      status: 'deleted',
      version: 6,
      updatedAt: timestamp(2500),
    },
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, 'timestamp-not-newer');
  assert.equal(db.state.root.updatedAt, currentTimestamp);
  assert.equal(db.state.root.version, 2);
});

test('hard delete de purga no toca el root y un viaje no activo queda cerrado', async () => {
  const db = fakeDb({
    schemaVersion: 4,
    status: 'deleted',
    version: 9,
    updatedAt: timestamp(1000),
  });

  const physicalDelete = await applyV4TripTouch({
    db,
    userId: 'alice',
    tripId: 'trip-1',
    entityId: 'connection-1',
    entityType: 'connection',
    after: null,
  });
  assert.equal(physicalDelete.reason, 'physical-delete');

  const deletedTrip = await applyV4TripTouch({
    db,
    userId: 'alice',
    tripId: 'trip-1',
    entityId: 'connection-1',
    entityType: 'connection',
    after: {
      id: 'connection-1',
      status: 'active',
      version: 1,
      updatedAt: timestamp(2000),
    },
  });
  assert.equal(deletedTrip.reason, 'trip-not-active');
  assert.equal(db.state.root.version, 9);
});

test('touch triggers cubren solo connections, notes y checklist con paths explícitos', () => {
  const registrations = [];
  const handlers = [];
  const triggerFactory = (options, handler) => {
    registrations.push(options);
    return { options, handler };
  };
  const handlerFactory = ({ entityType }) => {
    handlers.push(entityType);
    return async () => entityType;
  };

  const triggers = createV4TripTouchTriggers({
    db: { fake: true },
    region: 'us-central1',
    triggerFactory,
    handlerFactory,
  });

  assert.deepEqual(Object.keys(triggers), [
    'v4ConnectionTouch',
    'v4NoteTouch',
    'v4ChecklistTouch',
  ]);
  assert.deepEqual(handlers, ['connection', 'note', 'checklist']);
  assert.deepEqual(
    registrations.map((item) => item.document),
    [
      'users/{userId}/trips/{tripId}/connections/{entityId}',
      'users/{userId}/trips/{tripId}/notes/{entityId}',
      'users/{userId}/trips/{tripId}/checklist/{entityId}',
    ]
  );
  assert.ok(registrations.every((item) => item.region === 'us-central1' && item.retry === true));
});
