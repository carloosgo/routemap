import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  V4_TRIP_PURGE_BATCH_SIZE,
  V4_TRIP_PURGE_SCHEDULE,
  createV4TripPurgeScheduledFunction,
  createV4TripPurgeScheduledHandler,
} from '../functions/v4TripPurgeScheduler.js';

test('scheduler exige región explícita y limita solapamiento', async () => {
  let capturedOptions;
  let capturedHandler;
  const scheduled = createV4TripPurgeScheduledFunction({
    db: {},
    region: 'us-east1',
    scheduleFactory: (options, handler) => {
      capturedOptions = options;
      capturedHandler = handler;
      return { scheduled: true };
    },
    handlerOptions: {
      runPurges: async () => ({ scanned: 0, purged: 0, skipped: 0, failed: 0, failures: [] }),
      reportInfo: () => {},
      reportError: () => {},
    },
  });

  assert.deepEqual(scheduled, { scheduled: true });
  assert.equal(capturedOptions.schedule, V4_TRIP_PURGE_SCHEDULE);
  assert.equal(capturedOptions.region, 'us-east1');
  assert.equal(capturedOptions.timeZone, 'Etc/UTC');
  assert.equal(capturedOptions.maxInstances, 1);
  assert.equal(capturedOptions.concurrency, 1);
  assert.equal(capturedOptions.retryCount, 3);
  assert.equal(capturedOptions.minBackoffSeconds, 60);
  assert.equal(capturedOptions.maxBackoffSeconds, 300);
  assert.equal(typeof capturedHandler, 'function');

  assert.throws(
    () => createV4TripPurgeScheduledFunction({ db: {}, region: '   ', scheduleFactory: () => {} }),
    /region es obligatorio/
  );
});

test('handler usa batch acotado y registra resumen sin fallar cuando todo converge', async () => {
  const infos = [];
  let received;
  const handler = createV4TripPurgeScheduledHandler({
    db: { marker: true },
    runPurges: async (input) => {
      received = input;
      return { scanned: 3, purged: 2, skipped: 1, failed: 0, failures: [] };
    },
    reportInfo: (...args) => infos.push(args),
    reportError: () => {},
  });

  await handler();
  assert.equal(received.limit, V4_TRIP_PURGE_BATCH_SIZE);
  assert.equal(infos.length, 1);
  assert.equal(infos[0][1].purged, 2);
});

test('fallos parciales provocan retry del scheduler sin filtrar mensajes de excepción', async () => {
  const errors = [];
  const handler = createV4TripPurgeScheduledHandler({
    db: {},
    runPurges: async () => ({
      scanned: 2,
      purged: 1,
      skipped: 0,
      failed: 1,
      failures: [{ jobPath: 'users/alice/__tripPurgeJobs/trip-1', errorName: 'Error', errorCode: 'X' }],
    }),
    reportInfo: () => {},
    reportError: (...args) => errors.push(args),
  });

  await assert.rejects(handler(), /batch incomplete/);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1].failed, 1);
});

test('error inesperado se sanitiza antes de salir del scheduler', async () => {
  const errors = [];
  const handler = createV4TripPurgeScheduledHandler({
    db: {},
    runPurges: async () => {
      const error = new Error('secret firestore detail');
      error.code = 'SENSITIVE';
      throw error;
    },
    reportInfo: () => {},
    reportError: (...args) => errors.push(args),
  });

  await assert.rejects(handler(), (error) => {
    assert.equal(error.message, 'V4 trip purge scheduler failed.');
    assert.doesNotMatch(error.message, /secret|SENSITIVE/i);
    return true;
  });
  assert.equal(errors[0][1].errorCode, 'SENSITIVE');
});

test('Firestore declara el índice collection-group mínimo para dueAt de jobs de purga', async () => {
  const indexes = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const dueAt = indexes.fieldOverrides.find((entry) => (
    entry.collectionGroup === '__tripPurgeJobs' && entry.fieldPath === 'dueAt'
  ));
  assert.ok(dueAt);
  assert.ok(dueAt.indexes.some((entry) => (
    entry.order === 'ASCENDING' && entry.queryScope === 'COLLECTION_GROUP'
  )));
});
