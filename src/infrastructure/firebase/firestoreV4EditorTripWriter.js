import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { V4_LOCAL_STATES } from '../../modules/storage-v4/storageV4Contract.js';
import { createV4WebSyncComposition } from './createV4WebSyncComposition.js';
import { createFirestoreV4PilotTripWriter } from './firestoreV4PilotTripWriter.js';
import { createFirestoreV4SyncGateway } from './firestoreV4SyncGateway.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';
import { createV4SyncTelemetryEmitter } from './v4SyncTelemetryClient.js';
import { v4EntityPayload } from './v4EntityDocuments.js';
import {
  V4_TRIP_SAVE_COLLECTIONS,
  planV4TripSave,
} from './v4TripSavePlan.js';

const BLOCKING_LOCAL_STATES = new Set([
  V4_LOCAL_STATES.DIRTY,
  V4_LOCAL_STATES.SYNCING,
  V4_LOCAL_STATES.CONFLICT,
]);

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function createContextId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() es obligatorio para Storage v4 editor sync.');
  }
  return `atlas-v4-editor-${globalThis.crypto.randomUUID()}`;
}

function validateRemoteRoot(root) {
  if (!root) return null;
  if (Number(root.schemaVersion) !== 4) {
    throw new Error('El viaje remoto todavía no usa Storage v4.');
  }
  if (!Number.isInteger(root.version) || root.version < 1) {
    throw new TypeError('El root v4 remoto tiene version inválida.');
  }
  if (root.status !== 'active' && root.status !== 'deleted') {
    throw new TypeError('El root v4 remoto tiene status inválido.');
  }
  return root;
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
    desiredStatus: missing ? 'active' : remote.status,
    localRevision: current?.localRevision ?? 0,
    state: V4_LOCAL_STATES.CLEAN,
    conflict: null,
    lastModifiedLocal: nowMs,
  };
}

function localRecordAsRemote(record) {
  if (!record || record.serverVersion < 1) return null;
  if (record.entityType === 'trip') {
    return {
      id: record.entityId,
      ...(record.payload || {}),
      schemaVersion: 4,
      version: record.serverVersion,
      status: record.desiredStatus,
    };
  }
  return {
    id: record.entityId,
    ...(record.payload || {}),
    version: record.serverVersion,
    status: record.desiredStatus,
  };
}

function editorStateFromLocal(records, tripId) {
  const remoteCollections = Object.fromEntries(
    V4_TRIP_SAVE_COLLECTIONS.map(({ tripField }) => [tripField, []])
  );
  let remoteRoot = null;

  for (const record of records) {
    const remote = localRecordAsRemote(record);
    if (!remote) continue;
    if (record.entityType === 'trip' && record.entityId === tripId) {
      remoteRoot = remote;
      continue;
    }
    const definition = V4_TRIP_SAVE_COLLECTIONS.find(
      ({ entityType }) => entityType === record.entityType
    );
    if (definition) remoteCollections[definition.tripField].push(remote);
  }

  for (const collection of Object.values(remoteCollections)) {
    collection.sort((left, right) => String(left.rank || '').localeCompare(String(right.rank || '')));
  }
  return { remoteRoot, remoteCollections };
}

function browserLifecycleAvailable() {
  return typeof globalThis.window?.addEventListener === 'function'
    && typeof globalThis.document?.addEventListener === 'function';
}

/**
 * Product/editor bridge for the existing v4 pilot writer.
 *
 * Explicit save/delete continue to use the hardened pilot writer. Normal editor
 * changes use the same IndexedDB queue/runtime, but only commit incremental
 * entity intents and let the existing 3s scheduler coalesce/flush them. This
 * deliberately avoids calling the whole-trip save path on every editing pause.
 */
export function createFirestoreV4EditorTripWriter({
  db,
  uid,
  telemetryEnabled = true,
  lifecycleReady = false,
  now = () => Date.now(),
  repository = null,
  composition = null,
  compositionFactory = createV4WebSyncComposition,
  baseWriterFactory = createFirestoreV4PilotTripWriter,
  telemetryEmitter = null,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore para Storage v4 editor sync.');
  const userId = requiredText(uid, 'uid');
  const remoteRepository = repository || createFirestoreV4TripRepository({ db, uid: userId });
  const emitter = telemetryEmitter || (telemetryEnabled ? createV4SyncTelemetryEmitter() : null);
  const syncComposition = composition || compositionFactory({
    uid: userId,
    db,
    contextId: createContextId(),
    remoteGateway: createFirestoreV4SyncGateway({ repository: remoteRepository }),
    syncTelemetryEmitter: emitter,
    now,
    coordinatorOptions: { maxMutationsPerFlush: 25 },
  });
  const local = syncComposition.localPersistence;
  const runtime = syncComposition.runtime;
  if (!local || !runtime) throw new TypeError('La composición v4 editor está incompleta.');

  const baseWriter = baseWriterFactory({
    db,
    uid: userId,
    telemetryEnabled,
    lifecycleReady,
    now,
    repository: remoteRepository,
    composition: syncComposition,
    telemetryEmitter: emitter,
  });

  if (browserLifecycleAvailable()) {
    syncComposition.attachLifecycle?.();
  }

  let operationQueue = Promise.resolve();
  let closed = false;

  function enqueue(operation) {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.catch(() => undefined);
    return result;
  }

  async function putBaselineIfSafe({ tripId, entityType, entityId, remote, payload }) {
    const key = `${userId}/${tripId}/${entityType}/${entityId}`;
    const pending = await local.getMutation(key);
    const current = await local.getEntity(key);
    if (pending || (current && BLOCKING_LOCAL_STATES.has(current.state))) return false;
    await local.putEntity(baselineRecord({
      userId,
      tripId,
      entityType,
      entityId,
      remote,
      payload,
      current,
      nowMs: Math.max(0, Math.trunc(Number(now()) || Date.now())),
    }));
    return true;
  }

  async function primeRemoteState({ tripId, remoteRoot, remoteCollections = {} }) {
    const root = validateRemoteRoot(remoteRoot);
    if (!root) return 0;
    let primed = 0;
    if (await putBaselineIfSafe({
      tripId,
      entityType: 'trip',
      entityId: tripId,
      remote: root,
      payload: rootPayload(root, tripId),
    })) primed += 1;

    for (const { tripField, entityType } of V4_TRIP_SAVE_COLLECTIONS) {
      const items = Array.isArray(remoteCollections[tripField]) ? remoteCollections[tripField] : [];
      for (const remote of items) {
        if (await putBaselineIfSafe({
          tripId,
          entityType,
          entityId: requiredText(remote?.id, `${entityType}.id`),
          remote,
          payload: v4EntityPayload(entityType, remote, remote.rank),
        })) primed += 1;
      }
    }
    return primed;
  }

  async function readRemoteState(tripId) {
    const remoteRoot = validateRemoteRoot(await remoteRepository.getTripSummary(tripId));
    const remoteCollections = Object.fromEntries(
      V4_TRIP_SAVE_COLLECTIONS.map(({ tripField }) => [tripField, []])
    );
    if (!remoteRoot) return { remoteRoot: null, remoteCollections };
    await Promise.all(V4_TRIP_SAVE_COLLECTIONS.map(async ({ tripField, entityType }) => {
      remoteCollections[tripField] = await remoteRepository.listEntities(
        tripId,
        entityType,
        { includeDeleted: true }
      );
    }));
    return { remoteRoot, remoteCollections };
  }

  async function currentPlanState(tripId) {
    return editorStateFromLocal(
      await local.listEntities({ userId, tripId }),
      tripId
    );
  }

  async function assertNoConflict(tripId) {
    const entities = await local.listEntities({ userId, tripId });
    if (entities.some((entity) => entity.state === V4_LOCAL_STATES.CONFLICT)) {
      const error = new Error(
        'El viaje cambió en otra pestaña o dispositivo. Vuelve a abrirlo antes de guardar.'
      );
      error.code = 'trip/save-conflict';
      throw error;
    }
  }

  async function stageOnce(rawTrip) {
    if (closed) throw new Error('El writer v4 editor está cerrado.');
    const trip = normalizeTrip(rawTrip);
    await assertNoConflict(trip.id);

    let state = await currentPlanState(trip.id);
    if (!state.remoteRoot) {
      const remote = await readRemoteState(trip.id);
      if (!remote.remoteRoot) {
        return {
          supported: true,
          autosync: false,
          state: 'local',
          queued: 0,
          reason: 'trip-not-persisted',
        };
      }
      await primeRemoteState({
        tripId: trip.id,
        remoteRoot: remote.remoteRoot,
        remoteCollections: remote.remoteCollections,
      });
      state = await currentPlanState(trip.id);
    }

    const plan = planV4TripSave({
      uid: userId,
      rawTrip: trip,
      remoteRoot: state.remoteRoot,
      remoteCollections: state.remoteCollections,
    });
    if (plan.createsRoot) {
      return {
        supported: true,
        autosync: false,
        state: 'local',
        queued: 0,
        reason: 'trip-not-persisted',
      };
    }

    for (const intent of plan.intents) {
      await runtime.commitIntent(intent, { schedule: true });
    }
    const pending = await local.listMutations({ userId, tripId: trip.id });
    return {
      supported: true,
      autosync: true,
      state: pending.length ? 'pending' : 'saved',
      queued: plan.intents.length,
      pending: pending.length,
    };
  }

  async function persistenceStateOnce(tripId) {
    const id = requiredText(tripId, 'tripId');
    const [entities, pending] = await Promise.all([
      local.listEntities({ userId, tripId: id }),
      local.listMutations({ userId, tripId: id }),
    ]);
    if (entities.some((entity) => entity.state === V4_LOCAL_STATES.CONFLICT)) {
      return { supported: true, autosync: true, state: 'conflict', pending: pending.length };
    }
    if (entities.some((entity) => entity.state === V4_LOCAL_STATES.ERROR)) {
      return { supported: true, autosync: true, state: 'error', pending: pending.length };
    }
    const snapshot = runtime.snapshot();
    if (pending.length && snapshot.inFlight) {
      return { supported: true, autosync: true, state: 'syncing', pending: pending.length };
    }
    if (pending.length) {
      return {
        supported: true,
        autosync: true,
        state: snapshot.online === false ? 'local' : 'pending',
        pending: pending.length,
      };
    }
    return { supported: true, autosync: true, state: 'saved', pending: 0 };
  }

  async function acceptRemoteStateOnce(remoteState) {
    if (closed) throw new Error('El writer v4 editor está cerrado.');
    const tripId = requiredText(remoteState?.tripId, 'tripId');
    const accepted = await baseWriter.acceptRemoteState(remoteState);
    const primed = await primeRemoteState({
      tripId,
      remoteRoot: remoteState?.remoteRoot,
      remoteCollections: remoteState?.remoteCollections,
    });
    return { ...(accepted || {}), primed };
  }

  return {
    save(rawTrip) {
      return enqueue(() => baseWriter.save(rawTrip));
    },
    stage(rawTrip) {
      return enqueue(() => stageOnce(rawTrip));
    },
    getPersistenceState(tripId) {
      return persistenceStateOnce(tripId);
    },
    remove(tripId) {
      return enqueue(() => baseWriter.remove(tripId));
    },
    acceptRemoteState(remoteState) {
      return enqueue(() => acceptRemoteStateOnce(remoteState));
    },
    recoverPending(tripId = null) {
      return baseWriter.recoverPending(tripId);
    },
    async close() {
      if (closed) return;
      closed = true;
      await operationQueue.catch(() => undefined);
      await baseWriter.close();
    },
  };
}
