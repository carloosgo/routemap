import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  V4_TRIP_LIFECYCLE_ACTION,
  V4TripLifecycleError,
  applyV4TripLifecycleOperation,
} from './v4TripLifecycleStore.js';

let app;
let db;

async function seedTrip(id, overrides = {}) {
  const createdAt = Timestamp.fromMillis(1_700_000_000_000);
  await db.doc(`users/alice/trips/${id}`).set({
    id,
    name: 'Europa',
    currency: 'EUR',
    schemaVersion: 4,
    status: 'active',
    version: 1,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    purgeAfter: null,
    segmentCount: 2,
    placeCount: 5,
    total: 1200,
    ...overrides,
  });
}

before(() => {
  app = initializeApp({ projectId: 'atlasmap-v4-lifecycle-test' }, 'v4-lifecycle-test');
  db = getFirestore(app);
});

beforeEach(async () => {
  const snapshot = await db.collection('users').get();
  for (const user of snapshot.docs) await db.recursiveDelete(user.ref);
});

after(async () => {
  await deleteApp(app);
});

test('delete marca el viaje eliminado y agenda purga con la misma fecha autoritativa', async () => {
  const tripId = 'trip-delete';
  await seedTrip(tripId);
  const now = Timestamp.fromMillis(2_000_000_000_000);
  const retentionMs = 30 * 24 * 60 * 60 * 1000;

  const result = await applyV4TripLifecycleOperation({
    db,
    userId: 'alice',
    tripId,
    operationId: 'delete-op-0001',
    action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
    baseVersion: 1,
    retentionMs,
    now: () => now,
  });

  assert.equal(result.status, 'deleted');
  assert.equal(result.version, 2);
  assert.equal(result.idempotentReplay, false);
  assert.equal(result.deletedAt.toMillis(), now.toMillis());
  assert.equal(result.purgeAfter.toMillis(), now.toMillis() + retentionMs);

  const trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.status, 'deleted');
  assert.equal(trip.version, 2);
  assert.equal(trip.segmentCount, 2);
  assert.equal(trip.placeCount, 5);
  assert.equal(trip.total, 1200);

  const purgeJob = (await db.doc(`users/alice/__tripPurgeJobs/${tripId}`).get()).data();
  assert.equal(purgeJob.userId, 'alice');
  assert.equal(purgeJob.tripId, tripId);
  assert.equal(purgeJob.state, 'scheduled');
  assert.equal(purgeJob.dueAt.toMillis(), result.purgeAfter.toMillis());
});

test('repetir exactamente el mismo operationId es idempotente y no incrementa versión', async () => {
  const tripId = 'trip-replay';
  await seedTrip(tripId);
  const now = Timestamp.fromMillis(2_000_000_000_000);
  const input = {
    db,
    userId: 'alice',
    tripId,
    operationId: 'delete-op-0002',
    action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
    baseVersion: 1,
    now: () => now,
  };

  const first = await applyV4TripLifecycleOperation(input);
  const replay = await applyV4TripLifecycleOperation({
    ...input,
    now: () => Timestamp.fromMillis(now.toMillis() + 99_999),
  });

  assert.equal(first.version, 2);
  assert.equal(replay.version, 2);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.deletedAt.toMillis(), first.deletedAt.toMillis());
  assert.equal(replay.purgeAfter.toMillis(), first.purgeAfter.toMillis());
  const trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.version, 2);
});

test('reutilizar operationId con parámetros diferentes falla cerrado', async () => {
  const tripId = 'trip-reused-id';
  await seedTrip(tripId);
  await applyV4TripLifecycleOperation({
    db,
    userId: 'alice',
    tripId,
    operationId: 'lifecycle-op-0003',
    action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
    baseVersion: 1,
  });

  await assert.rejects(
    applyV4TripLifecycleOperation({
      db,
      userId: 'alice',
      tripId,
      operationId: 'lifecycle-op-0003',
      action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
      baseVersion: 2,
    }),
    (error) => error instanceof V4TripLifecycleError
      && error.code === 'operation-id-reused'
  );
});

test('restore de viaje está prohibido y no cancela la purga programada', async () => {
  const tripId = 'trip-no-restore';
  await seedTrip(tripId);
  const deleted = await applyV4TripLifecycleOperation({
    db,
    userId: 'alice',
    tripId,
    operationId: 'delete-op-0004',
    action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
    baseVersion: 1,
  });

  const purgeBefore = (await db.doc(`users/alice/__tripPurgeJobs/${tripId}`).get()).data();

  await assert.rejects(
    applyV4TripLifecycleOperation({
      db,
      userId: 'alice',
      tripId,
      operationId: 'restore-op-0004',
      action: 'restore',
      baseVersion: deleted.version,
    }),
    (error) => error instanceof TypeError && /solo admite delete/.test(error.message)
  );

  const trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  const purgeAfter = (await db.doc(`users/alice/__tripPurgeJobs/${tripId}`).get()).data();
  assert.equal(trip.status, 'deleted');
  assert.equal(trip.version, 2);
  assert.equal(purgeAfter.state, 'scheduled');
  assert.equal(purgeAfter.dueAt.toMillis(), purgeBefore.dueAt.toMillis());
});

test('baseVersion obsoleta no modifica un viaje más nuevo ni crea job de purga', async () => {
  const tripId = 'trip-stale';
  await seedTrip(tripId, { version: 4 });

  await assert.rejects(
    applyV4TripLifecycleOperation({
      db,
      userId: 'alice',
      tripId,
      operationId: 'delete-op-0005',
      action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
      baseVersion: 3,
    }),
    (error) => error instanceof V4TripLifecycleError
      && error.code === 'version-conflict'
  );

  const trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.status, 'active');
  assert.equal(trip.version, 4);
  assert.equal((await db.doc(`users/alice/__tripPurgeJobs/${tripId}`).get()).exists, false);
});

test('dos deletes concurrentes con la misma baseVersion nunca se aplican ni agendan dos veces', async () => {
  const tripId = 'trip-concurrent';
  await seedTrip(tripId);

  const calls = [
    applyV4TripLifecycleOperation({
      db,
      userId: 'alice',
      tripId,
      operationId: 'delete-concurrent-a',
      action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
      baseVersion: 1,
    }),
    applyV4TripLifecycleOperation({
      db,
      userId: 'alice',
      tripId,
      operationId: 'delete-concurrent-b',
      action: V4_TRIP_LIFECYCLE_ACTION.DELETE,
      baseVersion: 1,
    }),
  ];
  const settled = await Promise.allSettled(calls);
  const fulfilled = settled.filter((item) => item.status === 'fulfilled');
  const rejected = settled.filter((item) => item.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'version-conflict');
  const trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.status, 'deleted');
  assert.equal(trip.version, 2);
  const purgeJob = (await db.doc(`users/alice/__tripPurgeJobs/${tripId}`).get()).data();
  assert.equal(purgeJob.tripId, tripId);
  assert.equal(purgeJob.state, 'scheduled');
});
