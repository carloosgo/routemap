import { error as logError, info as logInfo } from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runDueV4TripPurges } from './v4TripPurgeStore.js';

export const V4_TRIP_PURGE_SCHEDULE = 'every 15 minutes';
export const V4_TRIP_PURGE_BATCH_SIZE = 25;

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

export function createV4TripPurgeScheduledHandler({
  db,
  runPurges = runDueV4TripPurges,
  reportInfo = logInfo,
  reportError = logError,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (typeof runPurges !== 'function') throw new TypeError('runPurges debe ser función.');
  if (typeof reportInfo !== 'function') throw new TypeError('reportInfo debe ser función.');
  if (typeof reportError !== 'function') throw new TypeError('reportError debe ser función.');

  return async function handleV4TripPurgeSchedule() {
    try {
      const summary = await runPurges({
        db,
        limit: V4_TRIP_PURGE_BATCH_SIZE,
      });
      if (summary.failed > 0) {
        reportError('V4 trip purge batch completed with failures.', {
          scanned: summary.scanned,
          purged: summary.purged,
          skipped: summary.skipped,
          failed: summary.failed,
          failures: summary.failures,
        });
        throw new Error('V4 trip purge batch incomplete.');
      }
      reportInfo('V4 trip purge batch completed.', {
        scanned: summary.scanned,
        purged: summary.purged,
        skipped: summary.skipped,
      });
    } catch (error) {
      if (error?.message === 'V4 trip purge batch incomplete.') throw error;
      reportError('V4 trip purge scheduler failed.', {
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
      });
      throw new Error('V4 trip purge scheduler failed.');
    }
  };
}

export function createV4TripPurgeScheduledFunction({
  db,
  region,
  scheduleFactory = onSchedule,
  handlerOptions,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const safeRegion = requiredText(region, 'region');
  if (typeof scheduleFactory !== 'function') throw new TypeError('scheduleFactory debe ser función.');
  const handler = createV4TripPurgeScheduledHandler({ db, ...handlerOptions });

  return scheduleFactory({
    schedule: V4_TRIP_PURGE_SCHEDULE,
    timeZone: 'Etc/UTC',
    region: safeRegion,
    timeoutSeconds: 120,
    memory: '256MiB',
    maxInstances: 1,
    concurrency: 1,
    retryCount: 3,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 300,
  }, handler);
}
