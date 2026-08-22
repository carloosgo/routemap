import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  migrateV3TripToV4,
  rollbackFreshV4Migration,
} from './v4MigrationStore.js';

let app;
let db;

const CREATED_AT = '2026-01-01T10:00:00.000Z';
const UPDATED_AT = '2026-08-01T10:00:00.000Z';

function expenses(lodging) {
  return {
    lodging,
    food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
    transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    transportOthers: [], attractions: [], others: [],
  };
}

async function seedV2Trip(tripId, overrides = {}) {
  const tripRef = db.doc(`users/alice/trips/${tripId}`);
  const revisionId = 'revision_v2_legacy';
  const revisionRef = tripRef.collection('revisions').doc(revisionId);
  const counts = {
    segmentCount: 1,
    placeCount: 1,
    noteCount: 1,
    checklistCount: 1,
  };
  const summary = {
    id: tripId,
    name: 'Legacy',
    currency: 'EUR',
    placeOrderVersion: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    storageVersion: 2,
    activeRevision: revisionId,
    ...counts,
    total: 75,
    ...overrides,
  };
  await tripRef.set(summary);
  await revisionRef.set({
    id: revisionId,
    createdAt: UPDATED_AT,
    complete: true,
    ...counts,
    ...(Object.hasOwn(overrides, 'routeConnectionCount')
      ? { routeConnectionCount: overrides.routeConnectionCount }
      : {}),
  });
  await revisionRef.collection('segments').doc('000000').set({
    id: 'segment-v2', position: 0, origin: null, destination: null,
    startDate: '', endDate: '', expenses: expenses(75), note: '',
  });
  await revisionRef.collection('places').doc('000000').set({
    id: 'place-v2', position: 0, provider: 'geoapify', googlePlaceId: '', userLabel: '',
    name: 'Legacy place', address: '', city: '', country: '', category: '', countryCode: '',
    lat: 20, lon: 20, savedAt: CREATED_AT,
  });
  await revisionRef.collection('notes').doc('000000').set({
    id: 'note-v2', position: 0, title: '', text: 'Legacy note',
  });
  await revisionRef.collection('checklist').doc('000000').set({
    id: 'check-v2', position: 0, text: 'Legacy item', done: false,
  });
  return { tripRef, revisionRef, summary };
}

before(() => {
  app = initializeApp({ projectId: 'atlasmap-v4-migration-v2-test' }, 'v4-migration-v2-test');
  db = getFirestore(app);
});

beforeEach(async () => {
  const users = await db.collection('users').get();
  for (const user of users.docs) await db.recursiveDelete(user.ref);
});

after(async () => {
  await deleteApp(app);
});

test('storageVersion 2 migra a v4 sin inventar conexiones y conserva versión origen en checkpoint', async () => {
  const { tripRef, revisionRef } = await seedV2Trip('trip-v2');

  const result = await migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-v2' });
  assert.equal(result.state, 'complete');
  const root = (await tripRef.get()).data();
  assert.equal(root.schemaVersion, 4);
  assert.equal(root.segmentCount, 1);
  assert.equal(root.placeCount, 1);
  assert.equal(root.total, 75);
  assert.equal((await tripRef.collection('connections').get()).empty, true);
  assert.equal((await revisionRef.get()).exists, true);

  const checkpoint = (await db.doc('users/alice/__tripMigrations/trip-v2').get()).data();
  assert.equal(checkpoint.sourceStorageVersion, 2);
});

test('rollback de una migración v2 restaura exactamente storageVersion 2 y limpia v4', async () => {
  const { tripRef, revisionRef, summary } = await seedV2Trip('trip-v2-rollback');
  await migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-v2-rollback' });

  const rollback = await rollbackFreshV4Migration({
    db,
    userId: 'alice',
    tripId: 'trip-v2-rollback',
  });
  assert.equal(rollback.state, 'rolled-back');
  assert.deepEqual((await tripRef.get()).data(), summary);
  assert.equal((await revisionRef.get()).exists, true);
  assert.equal((await tripRef.collection('segments').get()).empty, true);
  assert.equal((await tripRef.collection('places').get()).empty, true);
  assert.equal((await tripRef.collection('__aggregateContributions').get()).empty, true);
});

test('storageVersion 2 falla cerrado si declara conexiones que no pertenecen a ese esquema', async () => {
  await seedV2Trip('trip-v2-invalid-routes', { routeConnectionCount: 1 });

  await assert.rejects(
    migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-v2-invalid-routes' }),
    /storageVersion 2 no puede declarar routeConnections/
  );
  const root = (await db.doc('users/alice/trips/trip-v2-invalid-routes').get()).data();
  assert.equal(root.storageVersion, 2);
  assert.equal(root.schemaVersion, undefined);
});
