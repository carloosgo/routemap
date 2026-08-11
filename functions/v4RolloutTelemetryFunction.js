import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { info as logInfo } from 'firebase-functions/logger';
import { callableOptions, requireAuthenticated } from './callablePolicy.js';
import { sanitizeRolloutTelemetryBatch } from './v4RolloutTelemetryModel.js';

export const storageV4RolloutTelemetry = onCall(
  callableOptions({
    timeoutSeconds: 10,
    maxInstances: 5,
    concurrency: 40,
  }),
  async (request) => {
    logInfo('storage_v4_rollout_auth_state', {
      hasAuth: Boolean(request.auth),
      hasUid: Boolean(request.auth?.uid),
      hasAppCheck: Boolean(request.app),
    });

    requireAuthenticated(request);

    let events;
    try {
      events = sanitizeRolloutTelemetryBatch(request.data?.events);
    } catch (error) {
      throw new HttpsError(
        'invalid-argument',
        'La telemetría de rollout no tiene una forma válida.',
        { reason: error?.message || 'invalid-telemetry' }
      );
    }

    for (const event of events) {
      logInfo('storage_v4_rollout_metric', event);
    }

    return { accepted: events.length };
  }
);
