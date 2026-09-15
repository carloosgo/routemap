import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { info as logInfo } from 'firebase-functions/logger';
import { callableOptions, requireAuthenticated } from './callablePolicy.js';
import { sanitizeSyncTelemetryBatch } from './v4SyncTelemetryModel.js';

export const storageV4SyncTelemetry = onCall(
  callableOptions({
    timeoutSeconds: 10,
    maxInstances: 5,
    concurrency: 40,
  }),
  async (request) => {
    requireAuthenticated(request);

    let events;
    try {
      events = sanitizeSyncTelemetryBatch(request.data?.events);
    } catch (error) {
      throw new HttpsError(
        'invalid-argument',
        'La telemetría de sync no tiene una forma válida.',
        { reason: error?.message || 'invalid-telemetry' }
      );
    }

    for (const event of events) {
      logInfo('storage_v4_sync_metric', event);
    }

    return { accepted: events.length };
  }
);
