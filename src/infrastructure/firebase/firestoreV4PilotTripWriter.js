import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { v4EntityKey } from '../../modules/storage-v4/entityKeyModel.js';
import {
  V4_ENTITY_STATUS,
  V4_LOCAL_STATES,
} from '../../modules/storage-v4/storageV4Contract.js';
import { createV4WebSyncComposition } from './createV4WebSyncComposition.js';
import { firebaseCallable } from './callableFunctions.js';
import { createFirestoreV4SyncGateway } from './firestoreV4SyncGateway.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';
import { createV4SyncTelemetryEmitter } from './v4SyncTelemetryClient.js';
import { v4EntityPayload } from './v4EntityDocuments.js';
import {
  V4_TRIP_SAVE_COLLECTIONS,
  planV4TripSave,
} from './v4TripSavePlan.js';

export const V4_PILOT_SAVE_CONFLICT_CODE = 'trip/save-conflict';
export const V4_PILOT_SYNC_PENDING_CODE = 'trip/v4-sync-pending';
export const V4_PILOT_SYNC_BUSY_CODE = 'trip/v4-sync-busy';
export const V4_PILOT_WRITE_NOT_READY_CODE = 'trip/v4-write-not-ready';

const DEFAULT_MAX_FLUSH_PASSES = 64;
const DEFAULT_NON_LEADER_RETRY_MS = 80;

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function saveConflictError() {
  return codedError(
    V4_PILOT_SAVE_CONFLICT_CODE,
    'El viaje cambió en otra pestaña o dispositivo. Vuelve a abrirlo antes de guardar.'
  );
}

function syncPendingError() {
  return codedError(
    V4_PILOT_SYNC_PENDING_CODE,
    'El guardado quedó pendiente de sincronización. Atlas lo conservará en la cola local.'
  );
}

function syncBusyError() {
  return codedError(
    V4_PILOT_SYNC_BUSY_CODE,
    'Otro contexto está sincronizando este viaje. Intenta guardar de nuevo.'
  );
}

function writeNotReadyError(message) {
  return codedError(V4_PILOT_WRITE_NOT_READY_CODE, message);
}

function delayMs(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function timestampNow(now) {
  const value = Number(now());
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : Date.now();
}

function createContextId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() es obligatorio para Storage v4 pilot.');
  }
  return `atlas-v4-pilot-${globalThis.crypto.randomUUID()}`;
}

function createOperationId(action) {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() es obligatorio para lifecycle v4.');
  }
  return `${action}-${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
}

function firebaseFunctionCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

function rootPayload(remoteRoot, tripId) {
  return remoteRoot
    ? {
        id: remoteRoot.id || tripId,
        name: typeof remoteRoot.name === 'string' ? remoteRoot.name : '',
        currency: typeof remoteRoot.currency === 'string' ? remoteRoot.currency : 'USD',
      }
    : null;
}

function childPayload(entityType, remote) {
  if (!remote) return null;
  return v4EntityPayload(entityType, remote, remote.rank);
}

function baselineRecord({
  userId,
  tripId,
  entityType,
  entityId,
  remote,
  payload,
  current,
  nowMs,
}) {
  const missing = !remote;
  return {
    userId,
    tripId,
    entityType,
    entityId,
    payload: missing ? null : payload,
    serverVersion: missing ? 0 : remote.version,
    serverStatus: missing ? 'missing' : remote.status,
    desiredStatus: missing ? V4_ENTITY_STATUS.ACTIVE : remote.status,
    localRevision: current?.localRevision ?? 0,
    state: V4_LOCAL_STATES.CLEAN,
    conflict: null,
    lastModifiedLocal: nowMs,
  };
}

function validateRemoteRoot(root) {
  if (!root) return null;
  if (Number(root.schemaVersion) !== 4) {
    throw writeNotReadyError('El viaje existente todavía no usa Storage v4.');
  }
  if (!Number.isInteger(root.version) || root.version < 1) {
    throw new TypeError('El root v4 remoto tiene version inválida.');
  }
  if (root.status !== V4_ENTITY_STATUS.ACTIVE && root.status !== V4_ENTITY_STATUS.DELETED) {
    throw new TypeError('El root v4 remoto tiene status inválido.');
  }
  return root;
}

function lifecycleInvoker() {
  return async (data) => {
    const response = await firebaseCallable('v4TripLifecycle')(data);
    return response?.data || null;
  };
}

export function createFirestoreV4PilotTripWriter({
  db,
  uid,
  telemetryEnabled = true,
  lifecycleReady = false,
  now = () => Date.now(),
  wait = delayMs,
  maxFlushPasses = DEFAULT_MAX_FLUSH_PASSES,
  nonLeaderRetryMs = DEFAULT_NON_LEADER_RETRY_MS,
  repository = null,
  composition = null,
  compositionFactory = createV4WebSyncComposition,
  lifecycleCall = null,
  telemetryEmitter = null,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore para Storage v4 pilot.');
  const userId = requiredText(uid, 'uid');
  if (!Number.isInteger(maxFlushPasses) || maxFlushPasses < 1) {
    throw new TypeError('maxFlushPasses debe ser un entero positivo.');
  }
  if (!Number.isFinite(nonLeaderRetryMs) || nonLeaderRetryMs < 0) {
    throw new TypeError('nonLeaderRetryMs inválido.');
  }

  const remoteRepository = repository || createFirestoreV4TripRepository({ db, uid: userId });
  const emitter = telemetryEmitter || (telemetryEnabled ? createV4SyncTelemetryEmitter() : null);
  const syncComposition = composition || compositionFactory({
    uid: userId,
    db,
    contextId: createContextId(),
    remoteGateway: createFirestoreV4SyncGateway({ repository: remoteRepository }),
    syncTelemetryEmitter: emitter,
    coordinatorOptions: { maxMutationsPerFlush: 25 },
  });
  const local = syncComposition.localPersistence;
  const coordinator = syncComposition.syncCoordinator;
  const runtime = syncComposition.runtime;
  const callLifecycle = lifecycleCall || lifecycleInvoker();
  let mutationQueue = Promise.resolve();
  let closed = false;

  if (!local || !coordinator || !runtime) {
    throw new TypeError('La composición v4 pilot está incompleta.');
  }

  function enqueue(operation) {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => undefined);
    return result;
  }

  async function flushTelemetryBestEffort() {
    try {
      await emitter?.flush?.();
    } catch {
      // La persistencia nunca depende de observabilidad.
    }
  }

  function emitFlushMetric(result, startedAt, outcome = 'success', error = null) {
    if (!emitter?.emit) return;
    const metric = {
      event: 'flush',
      outcome,
      reason: 'save-now',
      durationMs: Math.max(0, timestampNow(now) - startedAt),
      pending: outcome === 'success' ? Math.max(0, Number(result?.pending) || 0) : null,
    };
    if (outcome === 'success') {
      for (const key of ['attempted', 'synced', 'retried', 'conflicts']) {
        const value = Number(result?.[key]);
        if (Number.isFinite(value) && value >= 0) metric[key] = Math.trunc(value);
      }
      metric.retryScheduled = result?.nextAttemptAt != null;
    } else {
      metric.errorName = error?.name || 'Error';
      metric.errorCode = typeof error?.code === 'string' ? error.code : '';
    }
    emitter.emit(metric);
  }

  async function observedFlush(tripId) {
    const startedAt = timestampNow(now);
    try {
      const result = await coordinator.flush({ userId, tripId });
      emitFlushMetric(result, startedAt);
      return result;
    } catch (error) {
      emitFlushMetric(null, startedAt, 'unexpected-error', error);
      throw error;
    }
  }

  async function assertNoConflict(tripId) {
    const entities = await local.listEntities({ userId, tripId });
    if (entities.some((entity) => entity.state === V4_LOCAL_STATES.CONFLICT)) {
      throw saveConflictError();
    }
  }

  async function drainTripQueue(tripId) {
    await assertNoConflict(tripId);
    let nonLeaderPasses = 0;

    for (let pass = 0; pass < maxFlushPasses; pass += 1) {
      const pendingBefore = await local.listMutations({ userId, tripId });
      if (!pendingBefore.length) {
        await assertNoConflict(tripId);
        return;
      }

      const currentTime = timestampNow(now);
      const due = pendingBefore.some(
        (mutation) => mutation.nextAttemptAt == null || mutation.nextAttemptAt <= currentTime
      );
      if (!due) throw syncPendingError();

      const result = await observedFlush(tripId);
      if (result?.leader === false) {
        nonLeaderPasses += 1;
        await wait(nonLeaderRetryMs);
        continue;
      }
      nonLeaderPasses = 0;
      if ((Number(result?.conflicts) || 0) > 0) throw saveConflictError();

      const pendingAfter = await local.listMutations({ userId, tripId });
      if (!pendingAfter.length) {
        await assertNoConflict(tripId);
        return;
      }
      if (
        result?.nextAttemptAt != null
        && Number(result.nextAttemptAt) > timestampNow(now)
      ) {
        throw syncPendingError();
      }
    }

    if (nonLeaderPasses > 0) throw syncBusyError();
    throw syncPendingError();
  }

  async function readRemoteState(tripId) {
    const remoteRoot = validateRemoteRoot(await remoteRepository.getTripSummary(tripId));
    const remoteCollections = {};
    if (!remoteRoot) {
      for (const { tripField } of V4_TRIP_SAVE_COLLECTIONS) remoteCollections[tripField] = [];
      return { remoteRoot: null, remoteCollections };
    }

    await Promise.all(V4_TRIP_SAVE_COLLECTIONS.map(async ({ tripField, entityType }) => {
      remoteCollections[tripField] = await remoteRepository.listEntities(
        tripId,
        entityType,
        { includeDeleted: true }
      );
    }));
    return { remoteRoot, remoteCollections };
  }

  async function writeBaseline({ tripId, entityType, entityId, remote, payload }) {
    const key = v4EntityKey({ userId, tripId, entityType, entityId });
    const pending = await local.getMutation(key);
    if (pending) throw syncPendingError();
    const current = await local.getEntity(key);
    if (current?.state === V4_LOCAL_STATES.CONFLICT) throw saveConflictError();
    if (
      current
      && current.state !== V4_LOCAL_STATES.CLEAN
      && current.state !== V4_LOCAL_STATES.ERROR
    ) {
      throw syncPendingError();
    }
    await local.putEntity(baselineRecord({
      userId,
      tripId,
      entityType,
      entityId,
      remote,
      payload,
      current,
      nowMs: timestampNow(now),
    }));
  }

  async function rebaseLocalBaselines(trip, remoteRoot, remoteCollections) {
    await writeBaseline({
      tripId: trip.id,
      entityType: 'trip',
      entityId: trip.id,
      remote: remoteRoot,
      payload: rootPayload(remoteRoot, trip.id),
    });

    for (const { tripField, entityType } of V4_TRIP_SAVE_COLLECTIONS) {
      const desired = Array.isArray(trip[tripField]) ? trip[tripField] : [];
      const remote = Array.isArray(remoteCollections[tripField]) ? remoteCollections[tripField] : [];
      const remoteById = new Map(remote.map((item) => [item.id, item]));
      const ids = new Set([...desired.map((item) => item.id), ...remote.map((item) => item.id)]);
      for (const entityId of ids) {
        const remoteEntity = remoteById.get(entityId) || null;
        await writeBaseline({
          tripId: trip.id,
          entityType,
          entityId,
          remote: remoteEntity,
          payload: childPayload(entityType, remoteEntity),
        });
      }
    }
  }

  async function acceptRemoteStateOnce({ tripId, remoteRoot, remoteCollections = {} } = {}) {
    if (closed) throw new Error('El writer v4 pilot está cerrado.');
    const id = requiredText(tripId, 'tripId');
    const root = validateRemoteRoot(remoteRoot);
    if (!root || (root.id && root.id !== id)) {
      throw new TypeError('El estado remoto abierto no coincide con el tripId v4.');
    }

    const conflicts = (await local.listEntities({ userId, tripId: id }))
      .filter((entity) => entity.state === V4_LOCAL_STATES.CONFLICT);
    if (!conflicts.length) return { clearedConflicts: 0 };

    const remoteByType = new Map();
    for (const { tripField, entityType } of V4_TRIP_SAVE_COLLECTIONS) {
      const items = Array.isArray(remoteCollections[tripField]) ? remoteCollections[tripField] : [];
      remoteByType.set(entityType, new Map(items.map((item) => [item.id, item])));
    }

    let clearedConflicts = 0;
    for (const current of conflicts) {
      const pending = await local.getMutation(current.key);
      if (pending) throw syncPendingError();
      const remote = current.entityType === 'trip'
        ? root
        : remoteByType.get(current.entityType)?.get(current.entityId) || null;
      const payload = current.entityType === 'trip'
        ? rootPayload(remote, id)
        : childPayload(current.entityType, remote);
      await local.putEntity(baselineRecord({
        userId,
        tripId: id,
        entityType: current.entityType,
        entityId: current.entityId,
        remote,
        payload,
        current,
        nowMs: timestampNow(now),
      }));
      clearedConflicts += 1;
    }
    return { clearedConflicts };
  }

  async function commitIntents(intents) {
    for (const intent of intents) {
      await runtime.commitIntent(intent, { schedule: false });
    }
  }

  async function saveOnce(rawTrip) {
    if (closed) throw new Error('El writer v4 pilot está cerrado.');
    const normalized = normalizeTrip(rawTrip);
    await drainTripQueue(normalized.id);

    const { remoteRoot, remoteCollections } = await readRemoteState(normalized.id);
    await rebaseLocalBaselines(normalized, remoteRoot, remoteCollections);
    const plan = planV4TripSave({
      uid: userId,
      rawTrip: normalized,
      remoteRoot,
      remoteCollections,
    });

    if (plan.createsRoot && plan.rootIntent) {
      await runtime.commitIntent(plan.rootIntent, { schedule: false });
      await drainTripQueue(normalized.id);
      await commitIntents(plan.childIntents);
    } else {
      await commitIntents(plan.intents);
    }

    await drainTripQueue(normalized.id);
    await flushTelemetryBestEffort();
    return normalizeTrip({ ...plan.trip, updatedAt: new Date(timestampNow(now)).toISOString() });
  }

  async function removeOnce(tripId) {
    if (closed) throw new Error('El writer v4 pilot está cerrado.');
    if (!lifecycleReady) {
      throw writeNotReadyError('Lifecycle v4 todavía no está habilitado para el pilot.');
    }
    const id = requiredText(tripId, 'tripId');
    await drainTripQueue(id);
    const root = validateRemoteRoot(await remoteRepository.getTripSummary(id));
    if (!root) return;
    if (root.status !== V4_ENTITY_STATUS.ACTIVE) {
      throw writeNotReadyError('El viaje v4 ya no está activo.');
    }

    try {
      const result = await callLifecycle({
        tripId: id,
        operationId: createOperationId('delete'),
        action: 'delete',
        baseVersion: root.version,
      });
      if (result?.status !== V4_ENTITY_STATUS.DELETED || result?.version !== root.version + 1) {
        throw new Error('Lifecycle v4 devolvió un resultado inesperado.');
      }
      await writeBaseline({
        tripId: id,
        entityType: 'trip',
        entityId: id,
        remote: {
          ...root,
          version: result.version,
          status: result.status,
        },
        payload: rootPayload(root, id),
      });
    } catch (error) {
      if (firebaseFunctionCode(error) === 'aborted') throw saveConflictError();
      throw error;
    }
  }

  return {
    save(rawTrip) {
      return enqueue(() => saveOnce(rawTrip));
    },
    remove(tripId) {
      return enqueue(() => removeOnce(tripId));
    },
    acceptRemoteState(remoteState) {
      return enqueue(() => acceptRemoteStateOnce(remoteState));
    },
    async recoverPending(tripId = null) {
      if (closed) return 0;
      if (tripId) {
        await drainTripQueue(requiredText(tripId, 'tripId'));
        return 0;
      }
      return runtime.recoverPending();
    },
    async close() {
      if (closed) return;
      closed = true;
      await mutationQueue.catch(() => undefined);
      await flushTelemetryBestEffort();
      await syncComposition.stop();
    },
  };
}
