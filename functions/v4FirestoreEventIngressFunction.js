import { error as logError, info as logInfo } from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';
import { db } from './geoapifyRuntime.js';
import { handleV4FirestoreEventIngress } from './v4FirestoreEventIngressHandler.js';
import { V4_PILOT_SERVICE_REGION } from './v4PilotBackendManifest.js';

export function createV4FirestoreEventIngressFunction({
  adminDb,
  region = V4_PILOT_SERVICE_REGION,
  requestFactory = onRequest,
  ingressHandler = handleV4FirestoreEventIngress,
  reportInfo = logInfo,
  reportError = logError,
} = {}) {
  if (!adminDb) throw new TypeError('Se requiere Firestore Admin.');
  if (typeof requestFactory !== 'function') throw new TypeError('requestFactory debe ser función.');
  if (typeof ingressHandler !== 'function') throw new TypeError('ingressHandler debe ser función.');

  return requestFactory({
    region,
    invoker: 'private',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 10,
    concurrency: 20,
  }, async (request, response) => {
    try {
      const result = await ingressHandler({
        db: adminDb,
        headers: request.headers,
      });
      reportInfo('Storage v4 Firestore event reconciled.', {
        eventId: result.eventId,
        entityType: result.entityType,
        documentPath: result.documentPath,
        processed: result.processed,
        reason: result.reason || null,
      });
      response.status(204).end();
    } catch (error) {
      const invalidEvent = error instanceof TypeError;
      reportError('Storage v4 Firestore event ingress failed.', {
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
        invalidEvent,
      });
      if (invalidEvent) {
        response.status(400).json({ error: 'invalid-firestore-event' });
        return;
      }
      response.status(500).json({ error: 'firestore-event-reconcile-failed' });
    }
  });
}

export const v4FirestoreEventIngress = createV4FirestoreEventIngressFunction({ adminDb: db });
