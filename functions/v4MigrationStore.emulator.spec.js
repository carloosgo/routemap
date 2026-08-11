import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  V4MigrationError,
  finalizeV3TripMigration,
  migrateV3TripToV4,
  rollbackFreshV4Migration,
  stageV3TripMigration,
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
    transportOthers: [], attractions: [], others: [],
  };
}

async function seedV3Trip(tripId = 'trip-migrate') {
  const tripRef = db.doc(`users/alice/trips/${tripId}`);
  const revisionId = 'revision_migrate_01';
  const revisionRef = tripRef.collection('revisions').doc(revisionId);
  const counts = {
    segmentCount: 1,
    placeCount: 1,
    routeConnectionCount: 0,
    noteCount: 1,
    checklistCount: 1,
  };
  await tripRef.set({
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
  });
  await revisionRef.set({
    id: revisionId,
    createdAt: UPDATED_AT,
    complete: true,
    ...counts,
  });
  await revisionRef.collection('segments').doc('000000').set({
    id: 'segment-1',
    position: 0,
    origin: { id: 'madrid', name: 'Madrid', displayName: 'Madrid', country: 'España', countryCode: 'ES', lat: 40.4168, lon: -3.7038 },
    destination: { id: 'paris', name: 'París', displayName: 'París', country: 'Francia', countryCode: 'FR', lat: 48.8566, lon: 2.3522 },
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    expenses: expenses(150),
    note: 'Tren',
  });
  await revisionRef.collection('places').doc('000000').set({
    id: 'place-1', position: 0, provider: 'geoapify', googlePlaceId: '', userLabel: '',
    name: 'Torre Eiffel', address: 'Champ de Mars', city: 'Paris', country: 'France',
    category: 'tourism', countryCode: 'FR', lat: 48.8584, lon: 2.2945,
    savedAt: '2026-05-01T10:00:00.000Z',
  });
  await revisionRef.collection('notes').doc('000000').set({
    id: 'note-1', position: 0, title: 'Reserva', text: 'Confirmar hotel',
  });
  await revisionRef.collection('checklist').doc('000000').set({
    id: 'check-1', position: 0, text: 'Pasaporte', done: true,
  });
  return { tripRef, revisionRef, revisionId };
}

before(() => {
  app = initializeApp({ projectId: 'atlasmap-v4-migration-store-test' }, 'v4-migration-store-test');
  db = getFirestore(app);
});

beforeEach(async () => {
  const users = await db.collection('users').get();
  for (const user of users.docs) await db.recursiveDelete(user.ref);
});

after(async () => {
  await deleteApp(app);
});

test('staging mantiene root v3 intacto, verifica entidades y siembra contribuciones', async () => {
  const { tripRef } = await seedV3Trip('trip-stage');
  await tripRef.collection('segments').doc('obsolete').set({ id: 'obsolete' });

  const staged = await stageV3TripMigration({ db, userId: 'alice', tripId: 'trip-stage' });
  assert.equal(staged.state, 'verified');

  const root = (await tripRef.get()).data();
  assert.equal(root.storageVersion, 3);
  assert.equal(root.schemaVersion, undefined);
  assert.equal((await tripRef.collection('segments').doc('obsolete').get()).exists, false);
  const segment = (await tripRef.collection('segments').doc('segment-1').get()).data();
  assert.equal(segment.version, 1);
  assert.equal(segment.status, 'active');
  const contribution = (await tripRef.collection('__aggregateContributions')
    .doc('segment:segment-1').get()).data();
  assert.equal(contribution.version, 1);
  assert.equal(contribution.countContribution, 1);
  assert.equal(contribution.valueContribution, 150);
  const checkpoint = (await db.doc('users/alice/__tripMigrations/trip-stage').get()).data();
  assert.equal(checkpoint.state, 'verified');
  assert.equal(checkpoint.sourceRevision, 'revision_migrate_01');
});

test('finalize cambia root a v4 en una sola transacción y replay de finalize es idempotente', async () => {
  const { tripRef, revisionRef } = await seedV3Trip('trip-finalize');
  const staged = await stageV3TripMigration({ db, userId: 'alice', tripId: 'trip-finalize' });
  const first = await finalizeV3TripMigration({
    db,
    userId: 'alice',
    tripId: 'trip-finalize',
    materialized: staged.materialized,
    digest: staged.digest,
  });
  assert.equal(first.state, 'complete');
  assert.equal(first.idempotentReplay, false);

  const root = (await tripRef.get()).data();
  assert.equal(root.schemaVersion, 4);
  assert.equal(root.version, 1);
  assert.equal(root.segmentCount, 1);
  assert.equal(root.placeCount, 1);
  assert.equal(root.total, 150);
  assert.equal(root.storageVersion, undefined);
  assert.equal((await revisionRef.get()).exists, true);

  const replay = await finalizeV3TripMigration({
    db,
    userId: 'alice',
    tripId: 'trip-finalize',
    materialized: staged.materialized,
    digest: staged.digest,
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.version, 1);
});

test('si v3 cambia después de staging, finalize falla y no reemplaza la fuente nueva', async () => {
  const { tripRef } = await seedV3Trip('trip-source-change');
  const staged = await stageV3TripMigration({ db, userId: 'alice', tripId: 'trip-source-change' });
  await tripRef.update({ updatedAt: '2026-08-10T20:01:00.000Z' });

  await assert.rejects(
    finalizeV3TripMigration({
      db,
      userId: 'alice',
      tripId: 'trip-source-change',
      materialized: staged.materialized,
      digest: staged.digest,
    }),
    (error) => error instanceof V4MigrationError && error.code === 'source-changed'
  );
  const root = (await tripRef.get()).data();
  assert.equal(root.storageVersion, 3);
  assert.equal(root.schemaVersion, undefined);
  assert.equal(root.updatedAt, '2026-08-10T20:01:00.000Z');
});

test('migrate completo conserva revision v3 y rollback fresco restaura exactamente el summary fuente', async () => {
  const { tripRef, revisionRef } = await seedV3Trip('trip-rollback');
  const original = (await tripRef.get()).data();
  const migrated = await migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-rollback' });
  assert.equal(migrated.state, 'complete');
  assert.equal((await tripRef.get()).data().schemaVersion, 4);

  const rollback = await rollbackFreshV4Migration({ db, userId: 'alice', tripId: 'trip-rollback' });
  assert.equal(rollback.state, 'rolled-back');
  assert.deepEqual((await tripRef.get()).data(), original);
  assert.equal((await revisionRef.get()).exists, true);
});

test('rollback falla cerrado si una entidad v4 ya avanzó después de migrar', async () => {
  const { tripRef } = await seedV3Trip('trip-rollback-unsafe');
  await migrateV3TripToV4({ db, userId: 'alice', tripId: 'trip-rollback-unsafe' });
  await tripRef.collection('segments').doc('segment-1').update({ version: 2 });

  await assert.rejects(
    rollbackFreshV4Migration({ db, userId: 'alice', tripId: 'trip-rollback-unsafe' }),
    (error) => error instanceof V4MigrationError && error.code === 'rollback-unsafe'
  );
  assert.equal((await tripRef.get()).data().schemaVersion, 4);
});
