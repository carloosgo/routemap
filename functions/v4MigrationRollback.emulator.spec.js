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
const UPDATED_AT = '2026-08-10T20:00:00.000Z';

function expenses(lodging) {
  return {
    lodging,
    food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
    transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    transportOthers: [],
    attractions: [],
    others: [],
  };
}

async function seedV3Trip(tripId) {
  const tripRef = db.doc(`users/alice/trips/${tripId}`);
  const revisionId = 'revision_rollback_01';
  const revisionRef = tripRef.collection('revisions').doc(revisionId);
  const counts = {
    segmentCount: 1,
    placeCount: 1,
    routeConnectionCount: 0,
    noteCount: 1,
    checklistCount: 1,
  };
  const summary = {
    id: tripId,
    name: 'Europa',
    currency: 'EUR',
    placeOrderVersion: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    storageVersion: 3,
    activeRevision: revisionId,
    ...counts,
    total: 150,
  };
  await tripRef.set(summary);
  await revisionRef.set({
    id: revisionId,
    createdAt: UPDATED_AT,
    complete: true,
    ...counts,
  });
  await revisionRef.collection('segments').doc('000000').set({
    id: 'segment-1',
    position: 0,
    origin: null,
    destination: null,
    startDate: '',
    endDate: '',
    expenses: expenses(150),
    note: '',
  });
  await revisionRef.collection('places').doc('000000').set({
    id: 'place-1',
    position: 0,
    provider: 'geoapify',
    googlePlaceId: '',
    userLabel: '',
    name: 'Lugar',
    address: '',
    city: '',
    country: '',
    category: '',
    countryCode: '',
    lat: 10,
    lon: 10,
    savedAt: CREATED_AT,
  });
  await revisionRef.collection('notes').doc('000000').set({
    id: 'note-1',
    position: 0,
    title: '',
    text: 'Nota',
  });
  await revisionRef.collection('checklist').doc('000000').set({
    id: 'check-1',
    position: 0,
    text: 'Pasaporte',
    done: false,
  });
  return { tripRef, revisionRef, summary };
}

async function assertV4CollectionsEmpty(tripRef) {
  for (const name of ['segments', 'places', 'connections', 'notes', 'checklist', '__aggregateContributions']) {
    const snapshot = await tripRef.collection(name).get();
    assert.equal(snapshot.empty, true, `${name} debe quedar vacío tras rollback`);
  }
}

before(() => {
  app = initializeApp({ projectId: 'atlasmap-v4-migration-rollback-test' }, 'v4-migration-rollback-test');
  db = getFirestore(app);
});

beforeEach(async () => {
  const users = await db.collection('users').get();
  for (const user of users.docs) await db.recursiveDelete(user.ref);
});

after(async () => {
  await deleteApp(app);
});

test('rollback restaura root v3, conserva revisión y elimina todo staging v4', async () => {
  const { tripRef, revisionRef, summary } = await seedV3Trip('trip-clean-rollback');
  await migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-clean-rollback' });

  const result = await rollbackFreshV4Migration({
    db,
    userId: 'alice',
    tripId: 'trip-clean-rollback',
  });

  assert.equal(result.state, 'rolled-back');
  assert.equal(result.idempotentReplay, false);
  assert.deepEqual((await tripRef.get()).data(), summary);
  assert.equal((await revisionRef.get()).exists, true);
  await assertV4CollectionsEmpty(tripRef);
  const checkpoint = (await db.doc('users/alice/__tripMigrations/trip-clean-rollback').get()).data();
  assert.equal(checkpoint.state, 'rolled-back');

  const replay = await rollbackFreshV4Migration({
    db,
    userId: 'alice',
    tripId: 'trip-clean-rollback',
  });
  assert.equal(replay.state, 'rolled-back');
  assert.equal(replay.idempotentReplay, true);
});

test('fallo de cleanup deja root seguro en v3 y retry reanuda desde rollback-cleanup', async () => {
  const { tripRef, revisionRef, summary } = await seedV3Trip('trip-resume-rollback');
  await migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-resume-rollback' });
  let cleanupCalls = 0;

  await assert.rejects(
    rollbackFreshV4Migration({
      db,
      userId: 'alice',
      tripId: 'trip-resume-rollback',
      cleanup: async () => {
        cleanupCalls += 1;
        throw new Error('simulated rollback cleanup failure');
      },
    }),
    /simulated rollback cleanup failure/
  );

  assert.equal(cleanupCalls, 1);
  assert.deepEqual((await tripRef.get()).data(), summary);
  assert.equal((await revisionRef.get()).exists, true);
  const pendingCheckpoint = (await db.doc('users/alice/__tripMigrations/trip-resume-rollback').get()).data();
  assert.equal(pendingCheckpoint.state, 'rollback-cleanup');
  assert.equal((await tripRef.collection('segments').doc('segment-1').get()).exists, true);

  const retry = await rollbackFreshV4Migration({
    db,
    userId: 'alice',
    tripId: 'trip-resume-rollback',
  });
  assert.equal(retry.state, 'rolled-back');
  await assertV4CollectionsEmpty(tripRef);
  const finalCheckpoint = (await db.doc('users/alice/__tripMigrations/trip-resume-rollback').get()).data();
  assert.equal(finalCheckpoint.state, 'rolled-back');
  assert.equal((await revisionRef.get()).exists, true);
});
