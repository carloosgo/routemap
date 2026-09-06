import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applyV4TripLifecycleOperation } from './v4TripLifecycleStore.js';
import { purgeV4TripJob, runDueV4TripPurges } from './v4TripPurgeStore.js';

let app;
let db;

const NOW = Timestamp.fromMillis(2_000_000_000_000);

async function seedDeletedTrip(id, { dueAt = NOW, jobDueAt = dueAt } = {}) {
  const tripRef = db.doc(`users/alice/trips/${id}`);
  const jobRef = db.doc(`users/alice/__tripPurgeJobs/${id}`);
  await tripRef.set({
    id,
    schemaVersion: 4,
    status: 'deleted',
    version: 2,
    purgeAfter: dueAt,
  });
  await tripRef.collection('segments').doc('segment-1').set({ id: 'segment-1' });
  await tripRef.collection('__lifecycleOperations').doc('delete-op').set({ ok: true });
  await jobRef.set({
    userId: 'alice',
    tripId: id,
    state: 'scheduled',
    dueAt: jobDueAt,
    createdAt: Timestamp.fromMillis(NOW.toMillis() - 1000),
    updatedAt: Timestamp.fromMillis(NOW.toMillis() - 1000),
  });
  return { tripRef, jobRef };
}

before(() => {
  app = initializeApp({ projectId: 'atlasmap-v4-purge-test' }, 'v4-purge-test');
  db = getFirestore(app);
});

after(async () => {
  await deleteApp(app);
});

test('job futuro no borra viaje ni descendientes', async () => {
  const id = 'trip-future';
  const future = Timestamp.fromMillis(NOW.toMillis() + 60_000);
  const { tripRef, jobRef } = await seedDeletedTrip(id, { dueAt: future });

  const result = await purgeV4TripJob({
    db,
    userId: 'alice',
    tripId: id,
    now: () => NOW,
  });

  assert.equal(result.purged, false);
  assert.equal(result.reason, 'not-due');
  assert.equal((await tripRef.get()).exists, true);
  assert.equal((await tripRef.collection('segments').doc('segment-1').get()).exists, true);
  assert.equal((await jobRef.get()).exists, true);
});

test('job stale nunca elimina un viaje cuya purgeAfter ya no coincide', async () => {
  const id = 'trip-stale-job';
  const newerDueAt = Timestamp.fromMillis(NOW.toMillis() + 120_000);
  const oldDueAt = Timestamp.fromMillis(NOW.toMillis() - 1000);
  const { tripRef, jobRef } = await seedDeletedTrip(id, {
    dueAt: newerDueAt,
    jobDueAt: oldDueAt,
  });

  const result = await purgeV4TripJob({
    db,
    userId: 'alice',
    tripId: id,
    now: () => NOW,
  });

  assert.equal(result.purged, false);
  assert.equal(result.reason, 'stale-job');
  assert.equal((await tripRef.get()).exists, true);
  assert.equal((await jobRef.get()).exists, true);
});

test('job vencido limpia subcolecciones y elimina raíz + job al final', async () => {
  const id = 'trip-expired';
  const dueAt = Timestamp.fromMillis(NOW.toMillis() - 1000);
  const { tripRef, jobRef } = await seedDeletedTrip(id, { dueAt });

  const result = await purgeV4TripJob({
    db,
    userId: 'alice',
    tripId: id,
    now: () => NOW,
  });

  assert.equal(result.purged, true);
  assert.equal(result.resumed, false);
  assert.equal((await tripRef.get()).exists, false);
  assert.equal((await tripRef.collection('segments').doc('segment-1').get()).exists, false);
  assert.equal((await tripRef.collection('__lifecycleOperations').doc('delete-op').get()).exists, false);
  assert.equal((await jobRef.get()).exists, false);
});

test('fallo de limpieza conserva raíz deleted + job claimed y un retry termina la purga', async () => {
  const id = 'trip-resume';
  const dueAt = Timestamp.fromMillis(NOW.toMillis() - 1000);
  const { tripRef, jobRef } = await seedDeletedTrip(id, { dueAt });
  let failures = 0;

  await assert.rejects(
    purgeV4TripJob({
      db,
      userId: 'alice',
      tripId: id,
      now: () => NOW,
      recursiveDelete: async () => {
        failures += 1;
        throw new Error('simulated cleanup failure');
      },
    }),
    /simulated cleanup failure/
  );

  assert.equal(failures, 1);
  const tripAfterFailure = (await tripRef.get()).data();
  assert.equal(tripAfterFailure.status, 'deleted');
  assert.equal((await tripRef.collection('segments').doc('segment-1').get()).exists, true);
  const claimedJob = (await jobRef.get()).data();
  assert.equal(claimedJob.state, 'claimed');

  const retry = await purgeV4TripJob({
    db,
    userId: 'alice',
    tripId: id,
    now: () => NOW,
  });
  assert.equal(retry.purged, true);
  assert.equal(retry.resumed, true);
  assert.equal((await tripRef.get()).exists, false);
  assert.equal((await tripRef.collection('segments').doc('segment-1').get()).exists, false);
  assert.equal((await jobRef.get()).exists, false);
});

test('restore no existe y no puede interferir después de que la purga adquiere el fence claimed', async () => {
  const id = 'trip-purge-fence';
  const dueAt = Timestamp.fromMillis(NOW.toMillis() - 1000);
  const { tripRef } = await seedDeletedTrip(id, { dueAt });
  let restoreError = null;
  let attemptedRestore = false;

  const result = await purgeV4TripJob({
    db,
    userId: 'alice',
    tripId: id,
    now: () => NOW,
    recursiveDelete: async (ref) => {
      if (!attemptedRestore) {
        attemptedRestore = true;
        try {
          await applyV4TripLifecycleOperation({
            db,
            userId: 'alice',
            tripId: id,
            operationId: 'restore-during-purge',
            action: 'restore',
            baseVersion: 2,
            now: () => NOW,
          });
        } catch (error) {
          restoreError = error;
        }
      }
      await db.recursiveDelete(ref);
    },
  });

  assert.equal(attemptedRestore, true);
  assert.ok(restoreError instanceof TypeError);
  assert.match(restoreError.message, /solo admite delete/);
  assert.equal(result.purged, true);
  assert.equal((await tripRef.get()).exists, false);
});

test('sweeper procesa jobs vencidos y deja fuera los futuros', async () => {
  const expiredDueAt = Timestamp.fromMillis(NOW.toMillis() - 5000);
  const futureDueAt = Timestamp.fromMillis(NOW.toMillis() + 5000);
  const expired = await seedDeletedTrip('trip-sweep-expired', { dueAt: expiredDueAt });
  const future = await seedDeletedTrip('trip-sweep-future', { dueAt: futureDueAt });

  const summary = await runDueV4TripPurges({ db, now: () => NOW, limit: 10 });
  assert.ok(summary.scanned >= 1);
  assert.ok(summary.purged >= 1);
  assert.equal(summary.failed, 0);
  assert.equal((await expired.tripRef.get()).exists, false);
  assert.equal((await expired.jobRef.get()).exists, false);
  assert.equal((await future.tripRef.get()).exists, true);
  assert.equal((await future.jobRef.get()).exists, true);
});
