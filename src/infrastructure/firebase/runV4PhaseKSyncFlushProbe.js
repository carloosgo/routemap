import { doc, getDoc } from 'firebase/firestore';
import { config } from '../../config.js';
import { createCrossContextNotifier } from '../../modules/storage-v4/crossContextNotifier.js';
import { createIndexedDbV4LocalPersistence } from '../../modules/storage-v4/indexedDbLocalPersistence.js';
import { V4_ENTITY_STATUS } from '../../modules/storage-v4/storageV4Contract.js';
import { firebaseCallable } from './callableFunctions.js';
import { createV4WebSyncComposition } from './createV4WebSyncComposition.js';
import { getFirebaseServices } from './firebaseClient.js';
import { createV4SyncTelemetryEmitter } from './v4SyncTelemetryClient.js';

const PROJECT = 'atlasmap-dev';
const PROBE_DB_NAME = 'atlas-storage-v4-phase-k-e2e';
const PROBE_CHANNEL_NAME = 'atlas-storage-v4-phase-k-e2e';
const PROBE_TRIP_PATTERN = /^phase-k-e2e-[a-z0-9_-]{8,80}$/;
const PROBE_LIFECYCLE_ACTION = 'delete';

export const PHASE_K_SYNC_FLUSH_CONFIRMATION = 'ATLAS_PHASE_K_SYNTHETIC_V4_WRITE_DEV';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function localHostname(hostname) {
  const value = String(hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function defaultRandomUuid() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() es obligatorio para crear el probe Phase K.');
  }
  return globalThis.crypto.randomUUID();
}

export function createPhaseKSyncFlushTripId(randomUuid = defaultRandomUuid) {
  const raw = requiredText(randomUuid(), 'randomUuid').toLowerCase();
  const suffix = raw.replace(/[^a-z0-9_-]/g, '').replaceAll('-', '').slice(0, 32);
  if (suffix.length < 8) throw new Error('randomUuid no produjo un sufijo valido.');
  return `phase-k-e2e-${suffix}`;
}

export function createPhaseKSyncFlushIntent({ uid, tripId } = {}) {
  const userId = requiredText(uid, 'uid');
  const id = requiredText(tripId, 'tripId');
  if (!PROBE_TRIP_PATTERN.test(id)) {
    throw new TypeError('tripId no pertenece al namespace sintetico Phase K.');
  }
  return {
    userId,
    tripId: id,
    entityType: 'trip',
    entityId: id,
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: V4_ENTITY_STATUS.ACTIVE,
    payload: {
      id,
      name: 'Phase K sync flush probe',
      currency: 'MXN',
    },
  };
}

async function defaultReadRemoteTrip({ db, uid, tripId }) {
  const snapshot = await getDoc(doc(db, `users/${uid}/trips/${tripId}`));
  return snapshot.exists() ? snapshot.data() : null;
}

function lifecycleOperationId(tripId) {
  return `${tripId}-delete`;
}

async function defaultRetireRemoteTrip({ tripId, baseVersion }) {
  const lifecycle = firebaseCallable('v4TripLifecycle');
  const response = await lifecycle({
    action: PROBE_LIFECYCLE_ACTION,
    tripId,
    operationId: lifecycleOperationId(tripId),
    baseVersion,
  });
  return response?.data || null;
}

function safeFlushSummary(result) {
  return {
    leader: result?.leader === true,
    attempted: Number(result?.attempted) || 0,
    synced: Number(result?.synced) || 0,
    retried: Number(result?.retried) || 0,
    conflicts: Number(result?.conflicts) || 0,
    pending: Number(result?.pending) || 0,
  };
}

function assertSuccessfulSingleFlush(result) {
  const summary = safeFlushSummary(result);
  if (
    !summary.leader
    || summary.attempted !== 1
    || summary.synced !== 1
    || summary.retried !== 0
    || summary.conflicts !== 0
    || summary.pending !== 0
  ) {
    throw new Error(`El sync flush sintetico no termino limpio: ${JSON.stringify(summary)}.`);
  }
  return summary;
}

function assertRemoteTrip(remote, tripId) {
  if (
    !remote
    || remote.id !== tripId
    || remote.schemaVersion !== 4
    || remote.status !== 'active'
    || remote.version !== 1
  ) {
    throw new Error('El documento remoto del probe no coincide con el root v4 esperado.');
  }
  return {
    schemaVersion: remote.schemaVersion,
    status: remote.status,
    version: remote.version,
  };
}

function assertLifecycleRetirement(result, tripId, baseVersion) {
  if (
    !result
    || result.action !== PROBE_LIFECYCLE_ACTION
    || result.tripId !== tripId
    || result.status !== 'deleted'
    || result.version !== baseVersion + 1
  ) {
    throw new Error('El lifecycle del probe no retiro el viaje sintetico como se esperaba.');
  }
  return {
    action: result.action,
    status: result.status,
    version: result.version,
    idempotentReplay: result.idempotentReplay === true,
  };
}

export async function runV4PhaseKSyncFlushProbe({
  uid,
  db,
  confirmation,
  hostname = globalThis.location?.hostname || '',
  tripId = createPhaseKSyncFlushTripId(),
  indexedDb = globalThis.indexedDB,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
  localPersistence = null,
  crossContextNotifier = null,
  syncTelemetryEmitter = null,
  compositionFactory = createV4WebSyncComposition,
  readRemoteTrip = defaultReadRemoteTrip,
  retireRemoteTrip = defaultRetireRemoteTrip,
} = {}) {
  const userId = requiredText(uid, 'uid');
  if (confirmation !== PHASE_K_SYNC_FLUSH_CONFIRMATION) {
    throw new Error('Falta la confirmacion literal del synthetic v4 WRITE de Phase K.');
  }
  if (!localHostname(hostname)) {
    throw new Error('El probe Phase K solo puede ejecutarse desde localhost.');
  }
  if (db?.app?.options?.projectId !== PROJECT) {
    throw new Error(`El probe Phase K esta bloqueado a ${PROJECT}.`);
  }
  if (!PROBE_TRIP_PATTERN.test(tripId)) {
    throw new Error('El probe Phase K exige un tripId sintetico phase-k-e2e-* valido.');
  }
  if (typeof compositionFactory !== 'function') throw new TypeError('compositionFactory invalida.');
  if (typeof readRemoteTrip !== 'function') throw new TypeError('readRemoteTrip invalida.');
  if (typeof retireRemoteTrip !== 'function') throw new TypeError('retireRemoteTrip invalida.');

  const local = localPersistence || createIndexedDbV4LocalPersistence({
    indexedDb,
    dbName: PROBE_DB_NAME,
  });
  const notifier = crossContextNotifier || createCrossContextNotifier({
    contextId: `${tripId}-context`,
    channelName: PROBE_CHANNEL_NAME,
    BroadcastChannelImpl,
  });
  const emitter = syncTelemetryEmitter || createV4SyncTelemetryEmitter({
    batchSize: 10,
    maxBufferedEvents: 20,
    flushDelayMs: 60_000,
  });

  const composition = compositionFactory({
    uid: userId,
    db,
    contextId: `${tripId}-context`,
    localPersistence: local,
    crossContextNotifier: notifier,
    syncTelemetryEmitter: emitter,
    coordinatorOptions: { maxMutationsPerFlush: 1 },
  });

  let remoteMayBeActive = false;
  let cleanupPassed = false;
  let lifecycleSummary = null;
  let localCleared = false;
  try {
    await local.clearUserData(userId);
    localCleared = true;

    const intent = createPhaseKSyncFlushIntent({ uid: userId, tripId });
    const committed = await composition.runtime.commitIntent(intent);
    if (committed?.discarded || !committed?.mutation) {
      throw new Error('El probe no genero la mutacion local CREATE esperada.');
    }

    const flushResult = await composition.runtime.saveNow();
    const flush = assertSuccessfulSingleFlush(flushResult);
    remoteMayBeActive = true;

    const remote = await readRemoteTrip({ db, uid: userId, tripId });
    const remoteSummary = assertRemoteTrip(remote, tripId);

    const telemetryFlushed = await emitter.flush();
    if (!telemetryFlushed) {
      throw new Error('No se pudo vaciar la telemetria sync del probe.');
    }

    const lifecycleResult = await retireRemoteTrip({
      db,
      uid: userId,
      tripId,
      baseVersion: remoteSummary.version,
      operationId: lifecycleOperationId(tripId),
    });
    lifecycleSummary = assertLifecycleRetirement(
      lifecycleResult,
      tripId,
      remoteSummary.version
    );
    remoteMayBeActive = false;
    cleanupPassed = true;

    await local.clearUserData(userId);
    localCleared = true;

    return {
      project: PROJECT,
      synthetic: true,
      tripId,
      syncFlushE2EPassed: true,
      flush,
      remote: remoteSummary,
      lifecycle: lifecycleSummary,
      telemetryFlushed: true,
      cleanupPassed,
      localProbeDataCleared: localCleared,
      globalStorageV4WriteFlagChanged: false,
      productionUntouched: true,
    };
  } finally {
    if (remoteMayBeActive) {
      try {
        const lifecycleResult = await retireRemoteTrip({
          db,
          uid: userId,
          tripId,
          baseVersion: 1,
          operationId: lifecycleOperationId(tripId),
        });
        lifecycleSummary = assertLifecycleRetirement(lifecycleResult, tripId, 1);
        remoteMayBeActive = false;
        cleanupPassed = true;
      } catch {
        // El caller recibe el error original; el lifecycle remoto es best-effort en finally.
      }
    }
    try {
      await local.clearUserData(userId);
      localCleared = true;
    } catch {
      // El IndexedDB del probe esta aislado; stop() cerrara el handle aunque falle el clear.
    }
    await composition.stop();
  }
}

export async function runCurrentUserV4PhaseKSyncFlushProbe({ confirmation } = {}) {
  if (config.firebase.useEmulators) {
    throw new Error('El probe Cloud Phase K requiere Firebase real, no emuladores.');
  }
  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Se requiere una sesion Firebase autenticada.');
  return runV4PhaseKSyncFlushProbe({
    uid: user.uid,
    db,
    confirmation,
  });
}
