import { deleteDoc, doc } from 'firebase/firestore';
import { config } from '../../config.js';
import { createCrossContextNotifier } from '../../modules/storage-v4/crossContextNotifier.js';
import { v4EntityKey } from '../../modules/storage-v4/entityKeyModel.js';
import { createIndexedDbV4LocalPersistence } from '../../modules/storage-v4/indexedDbLocalPersistence.js';
import { V4_LOCAL_STATES } from '../../modules/storage-v4/storageV4Contract.js';
import { createFirestoreV4TripRepository } from './firestoreV4TripRepository.js';
import { createV4WebSyncComposition } from './createV4WebSyncComposition.js';
import { getFirebaseServices } from './firebaseClient.js';
import { createV4SyncTelemetryEmitter } from './v4SyncTelemetryClient.js';

const PROJECT = 'atlasmap-dev';
const PROBE_TRIP_PATTERN = /^phase-k-e2e-[a-z0-9_-]{8,80}$/;
const ROLE_CONFIG = Object.freeze({
  A: Object.freeze({
    dbName: 'atlas-storage-v4-phase-k-md-a',
    channelName: 'atlas-storage-v4-phase-k-md-a',
    desiredName: 'Phase K multi-device winner A',
  }),
  B: Object.freeze({
    dbName: 'atlas-storage-v4-phase-k-md-b',
    channelName: 'atlas-storage-v4-phase-k-md-b',
    desiredName: 'Phase K multi-device stale B',
  }),
});

export const PHASE_K_MULTIDEVICE_CONFIRMATION = 'ATLAS_PHASE_K_SYNTHETIC_V4_MULTIDEVICE_WRITE_DEV';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function localHostname(hostname) {
  const value = String(hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function requireRole(role) {
  const value = String(role || '').trim().toUpperCase();
  if (!ROLE_CONFIG[value]) throw new TypeError('role debe ser A o B.');
  return value;
}

function requireConfirmation(confirmation) {
  if (confirmation !== PHASE_K_MULTIDEVICE_CONFIRMATION) {
    throw new Error('Falta la confirmacion literal del multi-device v4 WRITE de Phase K.');
  }
}

function requireProbeEnvironment({ db, hostname, tripId, confirmation }) {
  requireConfirmation(confirmation);
  if (!localHostname(hostname)) {
    throw new Error('El probe multi-device Phase K solo puede ejecutarse desde localhost.');
  }
  if (db?.app?.options?.projectId !== PROJECT) {
    throw new Error(`El probe multi-device Phase K esta bloqueado a ${PROJECT}.`);
  }
  if (!PROBE_TRIP_PATTERN.test(requiredText(tripId, 'tripId'))) {
    throw new Error('El probe multi-device exige un tripId sintetico phase-k-e2e-* valido.');
  }
}

function defaultRandomUuid() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() es obligatorio para crear el probe multi-device.');
  }
  return globalThis.crypto.randomUUID();
}

export function createPhaseKMultiDeviceTripId(randomUuid = defaultRandomUuid) {
  const raw = requiredText(randomUuid(), 'randomUuid').toLowerCase();
  const suffix = raw.replace(/[^a-z0-9_-]/g, '').replaceAll('-', '').slice(0, 32);
  if (suffix.length < 8) throw new Error('randomUuid no produjo un sufijo valido.');
  return `phase-k-e2e-${suffix}`;
}

export function createPhaseKMultiDeviceCreateIntent({ uid, tripId } = {}) {
  const userId = requiredText(uid, 'uid');
  const id = requiredText(tripId, 'tripId');
  if (!PROBE_TRIP_PATTERN.test(id)) throw new TypeError('tripId no pertenece al namespace sintetico.');
  return {
    userId,
    tripId: id,
    entityType: 'trip',
    entityId: id,
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: {
      id,
      name: 'Phase K multi-device base',
      currency: 'MXN',
    },
  };
}

export function createPhaseKMultiDeviceUpdateIntent({ uid, tripId, role, baseVersion = 1 } = {}) {
  const userId = requiredText(uid, 'uid');
  const id = requiredText(tripId, 'tripId');
  const clientRole = requireRole(role);
  if (!PROBE_TRIP_PATTERN.test(id)) throw new TypeError('tripId no pertenece al namespace sintetico.');
  if (!Number.isInteger(baseVersion) || baseVersion < 1) {
    throw new TypeError('baseVersion debe ser entero positivo.');
  }
  return {
    userId,
    tripId: id,
    entityType: 'trip',
    entityId: id,
    serverVersion: baseVersion,
    serverStatus: 'active',
    desiredStatus: 'active',
    payload: {
      id,
      name: ROLE_CONFIG[clientRole].desiredName,
      currency: 'MXN',
    },
  };
}

function createRoleResources({ role, indexedDb, BroadcastChannelImpl }) {
  const clientRole = requireRole(role);
  const roleConfig = ROLE_CONFIG[clientRole];
  const localPersistence = createIndexedDbV4LocalPersistence({
    indexedDb,
    dbName: roleConfig.dbName,
  });
  const crossContextNotifier = createCrossContextNotifier({
    contextId: `phase-k-md-${clientRole.toLowerCase()}`,
    channelName: roleConfig.channelName,
    BroadcastChannelImpl,
  });
  const syncTelemetryEmitter = createV4SyncTelemetryEmitter({
    batchSize: 10,
    maxBufferedEvents: 20,
    flushDelayMs: 60_000,
  });
  return {
    clientRole,
    roleConfig,
    localPersistence,
    crossContextNotifier,
    syncTelemetryEmitter,
  };
}

function createRoleComposition({ uid, db, role, indexedDb, BroadcastChannelImpl }) {
  const resources = createRoleResources({ role, indexedDb, BroadcastChannelImpl });
  const composition = createV4WebSyncComposition({
    uid,
    db,
    contextId: `phase-k-md-${resources.clientRole.toLowerCase()}`,
    localPersistence: resources.localPersistence,
    crossContextNotifier: resources.crossContextNotifier,
    syncTelemetryEmitter: resources.syncTelemetryEmitter,
    coordinatorOptions: { maxMutationsPerFlush: 1 },
  });
  return { ...resources, composition };
}

function assertSingleSuccessFlush(result) {
  const summary = {
    leader: result?.leader === true,
    attempted: Number(result?.attempted) || 0,
    synced: Number(result?.synced) || 0,
    retried: Number(result?.retried) || 0,
    conflicts: Number(result?.conflicts) || 0,
    pending: Number(result?.pending) || 0,
  };
  if (
    !summary.leader
    || summary.attempted !== 1
    || summary.synced !== 1
    || summary.retried !== 0
    || summary.conflicts !== 0
    || summary.pending !== 0
  ) {
    throw new Error(`El flush ganador multi-device no termino limpio: ${JSON.stringify(summary)}.`);
  }
  return summary;
}

function assertSingleConflictFlush(result) {
  const summary = {
    leader: result?.leader === true,
    attempted: Number(result?.attempted) || 0,
    synced: Number(result?.synced) || 0,
    retried: Number(result?.retried) || 0,
    conflicts: Number(result?.conflicts) || 0,
    pending: Number(result?.pending) || 0,
  };
  if (
    !summary.leader
    || summary.attempted !== 1
    || summary.synced !== 0
    || summary.retried !== 0
    || summary.conflicts !== 1
    || summary.pending !== 0
  ) {
    throw new Error(`El flush stale multi-device no produjo un conflicto limpio: ${JSON.stringify(summary)}.`);
  }
  return summary;
}

function assertRemoteTrip(remote, { tripId, version, name }) {
  if (
    !remote
    || remote.id !== tripId
    || remote.schemaVersion !== 4
    || remote.status !== 'active'
    || remote.version !== version
    || remote.name !== name
  ) {
    throw new Error(`El remoto multi-device no coincide con version ${version} / ${name}.`);
  }
  return {
    schemaVersion: remote.schemaVersion,
    status: remote.status,
    version: remote.version,
    name: remote.name,
  };
}

export async function setupV4PhaseKMultiDeviceProbe({
  uid,
  db,
  confirmation,
  hostname = globalThis.location?.hostname || '',
  tripId = createPhaseKMultiDeviceTripId(),
  indexedDb = globalThis.indexedDB,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
} = {}) {
  const userId = requiredText(uid, 'uid');
  requireProbeEnvironment({ db, hostname, tripId, confirmation });
  const repository = createFirestoreV4TripRepository({ db, uid: userId });
  const role = createRoleComposition({
    uid: userId,
    db,
    role: 'A',
    indexedDb,
    BroadcastChannelImpl,
  });

  let remoteMayExist = false;
  try {
    await role.localPersistence.clearUserData(userId);
    const committed = await role.composition.runtime.commitIntent(
      createPhaseKMultiDeviceCreateIntent({ uid: userId, tripId })
    );
    if (committed?.discarded || !committed?.mutation) {
      throw new Error('Setup multi-device no genero la mutacion CREATE esperada.');
    }
    const flush = assertSingleSuccessFlush(await role.composition.runtime.saveNow());
    remoteMayExist = true;
    const remote = assertRemoteTrip(await repository.getTripSummary(tripId), {
      tripId,
      version: 1,
      name: 'Phase K multi-device base',
    });
    const telemetryFlushed = await role.syncTelemetryEmitter.flush();
    if (!telemetryFlushed) throw new Error('Setup multi-device no pudo vaciar telemetria sync.');
    await role.localPersistence.clearUserData(userId);
    return {
      project: PROJECT,
      synthetic: true,
      tripId,
      setupPassed: true,
      flush,
      remote,
      next: 'stage A and B while remote remains version 1',
      globalStorageV4WriteFlagChanged: false,
      productionUntouched: true,
    };
  } catch (error) {
    if (remoteMayExist) {
      try {
        await deleteDoc(doc(db, `users/${userId}/trips/${tripId}`));
      } catch {
        // Best-effort cleanup; preserve the original setup error.
      }
    }
    throw error;
  } finally {
    await role.composition.stop();
  }
}

export async function stageV4PhaseKMultiDeviceRole({
  uid,
  db,
  role,
  tripId,
  confirmation,
  hostname = globalThis.location?.hostname || '',
  indexedDb = globalThis.indexedDB,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
} = {}) {
  const userId = requiredText(uid, 'uid');
  const clientRole = requireRole(role);
  requireProbeEnvironment({ db, hostname, tripId, confirmation });
  const repository = createFirestoreV4TripRepository({ db, uid: userId });
  const remote = assertRemoteTrip(await repository.getTripSummary(tripId), {
    tripId,
    version: 1,
    name: 'Phase K multi-device base',
  });
  const resources = createRoleComposition({
    uid: userId,
    db,
    role: clientRole,
    indexedDb,
    BroadcastChannelImpl,
  });
  try {
    await resources.localPersistence.clearUserData(userId);
    const intent = createPhaseKMultiDeviceUpdateIntent({
      uid: userId,
      tripId,
      role: clientRole,
      baseVersion: remote.version,
    });
    const committed = await resources.composition.runtime.commitIntent(intent);
    if (committed?.discarded || !committed?.mutation) {
      throw new Error(`Role ${clientRole} no genero la mutacion UPDATE esperada.`);
    }
    const key = v4EntityKey(intent);
    const mutation = await resources.localPersistence.getMutation(key);
    if (!mutation || mutation.operation !== 'update' || mutation.baseVersion !== 1) {
      throw new Error(`Role ${clientRole} no dejo una mutacion stale baseVersion=1.`);
    }
    return {
      project: PROJECT,
      synthetic: true,
      tripId,
      role: clientRole,
      staged: true,
      baseVersion: mutation.baseVersion,
      desiredName: resources.roleConfig.desiredName,
      remoteVersionAtStage: remote.version,
      remoteWritePerformed: false,
      globalStorageV4WriteFlagChanged: false,
      productionUntouched: true,
    };
  } finally {
    await resources.composition.stop();
  }
}

export async function flushV4PhaseKMultiDeviceWinnerA({
  uid,
  db,
  tripId,
  confirmation,
  hostname = globalThis.location?.hostname || '',
  indexedDb = globalThis.indexedDB,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
} = {}) {
  const userId = requiredText(uid, 'uid');
  requireProbeEnvironment({ db, hostname, tripId, confirmation });
  const repository = createFirestoreV4TripRepository({ db, uid: userId });
  const resources = createRoleComposition({
    uid: userId,
    db,
    role: 'A',
    indexedDb,
    BroadcastChannelImpl,
  });
  try {
    const recovered = await resources.composition.runtime.recoverPending();
    if (recovered !== 1) throw new Error(`Role A esperaba 1 mutacion pendiente; encontro ${recovered}.`);
    const flush = assertSingleSuccessFlush(await resources.composition.runtime.saveNow());
    const remote = assertRemoteTrip(await repository.getTripSummary(tripId), {
      tripId,
      version: 2,
      name: ROLE_CONFIG.A.desiredName,
    });
    const telemetryFlushed = await resources.syncTelemetryEmitter.flush();
    if (!telemetryFlushed) throw new Error('Role A no pudo vaciar telemetria sync.');
    await resources.localPersistence.clearUserData(userId);
    return {
      project: PROJECT,
      synthetic: true,
      tripId,
      role: 'A',
      winnerFlushPassed: true,
      flush,
      remote,
      telemetryFlushed: true,
      localWinnerDataCleared: true,
      next: 'flush B; it must resolve as explicit conflict',
      globalStorageV4WriteFlagChanged: false,
      productionUntouched: true,
    };
  } finally {
    await resources.composition.stop();
  }
}

export async function flushV4PhaseKMultiDeviceLoserB({
  uid,
  db,
  tripId,
  confirmation,
  hostname = globalThis.location?.hostname || '',
  indexedDb = globalThis.indexedDB,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
} = {}) {
  const userId = requiredText(uid, 'uid');
  requireProbeEnvironment({ db, hostname, tripId, confirmation });
  const repository = createFirestoreV4TripRepository({ db, uid: userId });
  const resources = createRoleComposition({
    uid: userId,
    db,
    role: 'B',
    indexedDb,
    BroadcastChannelImpl,
  });
  let cleanupPassed = false;
  try {
    const recovered = await resources.composition.runtime.recoverPending();
    if (recovered !== 1) throw new Error(`Role B esperaba 1 mutacion pendiente; encontro ${recovered}.`);
    const flush = assertSingleConflictFlush(await resources.composition.runtime.saveNow());
    const key = v4EntityKey({
      userId,
      tripId,
      entityType: 'trip',
      entityId: tripId,
    });
    const local = await resources.localPersistence.getEntity(key);
    if (
      !local
      || local.state !== V4_LOCAL_STATES.CONFLICT
      || local.payload?.name !== ROLE_CONFIG.B.desiredName
      || local.serverVersion !== 2
      || local.serverStatus !== 'active'
      || local.conflict?.serverVersion !== 2
      || local.conflict?.serverStatus !== 'active'
      || local.conflict?.payload?.name !== ROLE_CONFIG.A.desiredName
    ) {
      throw new Error('Role B no conservo correctamente payload local + snapshot remoto del conflicto.');
    }
    const pendingMutation = await resources.localPersistence.getMutation(key);
    if (pendingMutation) throw new Error('Role B con conflicto no debe conservar mutacion pendiente.');
    const remote = assertRemoteTrip(await repository.getTripSummary(tripId), {
      tripId,
      version: 2,
      name: ROLE_CONFIG.A.desiredName,
    });
    const telemetryFlushed = await resources.syncTelemetryEmitter.flush();
    if (!telemetryFlushed) throw new Error('Role B no pudo vaciar telemetria sync.');

    await deleteDoc(doc(db, `users/${userId}/trips/${tripId}`));
    const deleted = await repository.getTripSummary(tripId);
    if (deleted !== null) throw new Error('Cleanup multi-device no elimino el trip sintetico remoto.');
    cleanupPassed = true;
    await resources.localPersistence.clearUserData(userId);

    return {
      project: PROJECT,
      synthetic: true,
      tripId,
      multiDeviceConflictE2EPassed: true,
      winner: {
        role: 'A',
        remoteVersion: remote.version,
        remoteName: remote.name,
      },
      loser: {
        role: 'B',
        localState: local.state,
        localName: local.payload.name,
        conflictRemoteVersion: local.conflict.serverVersion,
        conflictRemoteName: local.conflict.payload.name,
        pendingMutationRemoved: true,
      },
      flush,
      telemetryFlushed: true,
      cleanupPassed,
      localLoserDataCleared: true,
      noSilentLoss: true,
      globalStorageV4WriteFlagChanged: false,
      productionUntouched: true,
    };
  } finally {
    if (!cleanupPassed) {
      try {
        await deleteDoc(doc(db, `users/${userId}/trips/${tripId}`));
      } catch {
        // Best-effort remote cleanup on failure.
      }
    }
    try {
      await resources.localPersistence.clearUserData(userId);
    } catch {
      // Isolated synthetic IndexedDB; composition.stop() still closes the handle.
    }
    await resources.composition.stop();
  }
}

function currentUserContext() {
  if (config.firebase.useEmulators) {
    throw new Error('El probe Cloud multi-device requiere Firebase real, no emuladores.');
  }
  const { auth, db } = getFirebaseServices();
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Se requiere una sesion Firebase autenticada.');
  return { uid: user.uid, db };
}

export function setupCurrentUserV4PhaseKMultiDeviceProbe({ confirmation } = {}) {
  return setupV4PhaseKMultiDeviceProbe({
    ...currentUserContext(),
    confirmation,
  });
}

export function stageCurrentUserV4PhaseKMultiDeviceRole({ role, tripId, confirmation } = {}) {
  return stageV4PhaseKMultiDeviceRole({
    ...currentUserContext(),
    role,
    tripId,
    confirmation,
  });
}

export function flushCurrentUserV4PhaseKMultiDeviceWinnerA({ tripId, confirmation } = {}) {
  return flushV4PhaseKMultiDeviceWinnerA({
    ...currentUserContext(),
    tripId,
    confirmation,
  });
}

export function flushCurrentUserV4PhaseKMultiDeviceLoserB({ tripId, confirmation } = {}) {
  return flushV4PhaseKMultiDeviceLoserB({
    ...currentUserContext(),
    tripId,
    confirmation,
  });
}
