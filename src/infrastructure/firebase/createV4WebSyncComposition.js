import { createCrossContextNotifier } from '../../modules/storage-v4/crossContextNotifier.js';
import { createIndexedDbV4LocalPersistence } from '../../modules/storage-v4/indexedDbLocalPersistence.js';
import { createV4SyncCoordinator } from '../../modules/storage-v4/syncCoordinator.js';
import { createV4SyncRuntime } from '../../modules/storage-v4/syncRuntime.js';
import { attachV4WebSyncLifecycle } from '../../modules/storage-v4/webSyncLifecycleBridge.js';
import { createFirestoreV4SyncGateway } from './firestoreV4SyncGateway.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function defaultLocalPersistence(options) {
  return createIndexedDbV4LocalPersistence(options);
}

function defaultRemoteGateway({ db, uid }) {
  if (!db) throw new TypeError('Se requiere Firestore para componer sync v4.');
  const repository = createFirestoreV4TripRepository({ db, uid });
  return createFirestoreV4SyncGateway({ repository });
}

function normalizeTelemetryEmitter(emitter) {
  if (!emitter) return null;
  if (typeof emitter.emit !== 'function') {
    throw new TypeError('syncTelemetryEmitter requiere emit().');
  }
  return emitter;
}

/**
 * Composition root for the web implementation of Atlas Storage v4.
 *
 * This factory is intentionally side-effect free with respect to application
 * rollout: creating it does not replace the active trip repository and does not
 * attach browser lifecycle listeners until attachLifecycle() is called.
 */
export function createV4WebSyncComposition({
  uid,
  db = null,
  contextId,
  localPersistence = null,
  remoteGateway = null,
  crossContextNotifier = null,
  syncTelemetryEmitter = null,
  indexedDb,
  BroadcastChannelImpl,
  now = () => Date.now(),
  randomUnit = () => Math.random(),
  coordinatorOptions = {},
  lifecycleOptions = {},
} = {}) {
  const ownerId = requiredText(uid, 'uid');
  const sourceContextId = requiredText(contextId, 'contextId');
  const local = localPersistence || defaultLocalPersistence({ indexedDb });
  const notifier = crossContextNotifier || createCrossContextNotifier({
    contextId: sourceContextId,
    BroadcastChannelImpl,
  });
  const gateway = remoteGateway || defaultRemoteGateway({ db, uid: ownerId });
  const telemetryEmitter = normalizeTelemetryEmitter(syncTelemetryEmitter);
  const resolvedLifecycleOptions = telemetryEmitter && typeof lifecycleOptions.onMetric !== 'function'
    ? { ...lifecycleOptions, onMetric: (metric) => telemetryEmitter.emit(metric) }
    : lifecycleOptions;
  const coordinator = createV4SyncCoordinator({
    localPersistence: local,
    remoteGateway: gateway,
    contextId: sourceContextId,
    now,
    randomUnit,
    ...coordinatorOptions,
  });
  const runtime = createV4SyncRuntime({
    userId: ownerId,
    localPersistence: local,
    syncCoordinator: coordinator,
    crossContextNotifier: notifier,
    now,
    lifecycleOptions: resolvedLifecycleOptions,
  });

  let lifecycleBridge = null;
  let stopped = false;

  return {
    localPersistence: local,
    remoteGateway: gateway,
    syncCoordinator: coordinator,
    runtime,
    notifier,
    syncTelemetryEmitter: telemetryEmitter,

    attachLifecycle(options = {}) {
      if (stopped) throw new Error('La composición v4 está detenida.');
      if (lifecycleBridge) return lifecycleBridge;
      lifecycleBridge = attachV4WebSyncLifecycle({ runtime, ...options });
      return lifecycleBridge;
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      lifecycleBridge?.detach();
      lifecycleBridge = null;
      runtime.stop();
      notifier.close?.();
      try {
        await telemetryEmitter?.flush?.();
      } finally {
        telemetryEmitter?.stop?.();
      }
      await local.close?.();
    },
  };
}
