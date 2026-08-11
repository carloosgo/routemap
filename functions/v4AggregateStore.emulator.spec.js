import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applyV4AggregateEvent } from './v4AggregateStore.js';

let app;
let db;

function expenses(total) {
  return {
    lodging: total,
    food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
    transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    transportOthers: [],
    attractions: [],
    others: [],
  };
}

function segment(id, version, total, status = 'active') {
  return { id, version, status, expenses: expenses(total) };
}

async function seedTrip(id) {
  await db.doc(`users/alice/trips/${id}`).set({
    id,
    schemaVersion: 4,
    status: 'active',
    segmentCount: 0,
    placeCount: 0,
    total: 0,
  });
}

before(() => {
  app = initializeApp({ projectId: 'atlasmap-v4-aggregate-test' }, 'v4-aggregate-test');
  db = getFirestore(app);
});

beforeEach(async () => {
  const snapshot = await db.collection('users').get();
  for (const user of snapshot.docs) {
    await db.recursiveDelete(user.ref);
  }
});

after(async () => {
  await deleteApp(app);
});

test('agregado de segmento converge aunque eventos lleguen duplicados y fuera de orden', async () => {
  const tripId = 'trip-aggregate';
  await seedTrip(tripId);

  const v1 = segment('segment-1', 1, 100);
  await applyV4AggregateEvent({
    db, userId: 'alice', tripId, entityType: 'segment', after: v1,
  });
  let trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.segmentCount, 1);
  assert.equal(trip.total, 100);

  const duplicate = await applyV4AggregateEvent({
    db, userId: 'alice', tripId, entityType: 'segment', after: v1,
  });
  assert.equal(duplicate.applied, false);

  const v2 = segment('segment-1', 2, 120);
  const v3 = segment('segment-1', 3, 140);
  await applyV4AggregateEvent({
    db, userId: 'alice', tripId, entityType: 'segment', before: v2, after: v3,
  });
  const lateV2 = await applyV4AggregateEvent({
    db, userId: 'alice', tripId, entityType: 'segment', before: v1, after: v2,
  });
  assert.equal(lateV2.applied, false);

  trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.segmentCount, 1);
  assert.equal(trip.total, 140);
});

test('tombstone descuenta una sola vez y restore vuelve a aportar', async () => {
  const tripId = 'trip-delete-restore';
  await seedTrip(tripId);
  const activeV1 = segment('segment-1', 1, 80);
  await applyV4AggregateEvent({
    db, userId: 'alice', tripId, entityType: 'segment', after: activeV1,
  });

  const deletedV2 = segment('segment-1', 2, 80, 'deleted');
  await applyV4AggregateEvent({
    db,
    userId: 'alice',
    tripId,
    entityType: 'segment',
    before: activeV1,
    after: deletedV2,
  });
  await applyV4AggregateEvent({
    db,
    userId: 'alice',
    tripId,
    entityType: 'segment',
    before: deletedV2,
    after: null,
  });

  let trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.segmentCount, 0);
  assert.equal(trip.total, 0);

  const restoredV3 = segment('segment-1', 3, 90);
  await applyV4AggregateEvent({
    db,
    userId: 'alice',
    tripId,
    entityType: 'segment',
    before: deletedV2,
    after: restoredV3,
  });
  trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.segmentCount, 1);
  assert.equal(trip.total, 90);
});

test('places modifican placeCount pero nunca el total monetario', async () => {
  const tripId = 'trip-place-aggregate';
  await seedTrip(tripId);
  const place = { id: 'place-1', version: 1, status: 'active' };
  await applyV4AggregateEvent({
    db, userId: 'alice', tripId, entityType: 'place', after: place,
  });
  const trip = (await db.doc(`users/alice/trips/${tripId}`).get()).data();
  assert.equal(trip.placeCount, 1);
  assert.equal(trip.segmentCount, 0);
  assert.equal(trip.total, 0);
});
