import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE_K_SYNC_FLUSH_CONFIRMATION,
  createPhaseKSyncFlushIntent,
  createPhaseKSyncFlushTripId,
  runV4PhaseKSyncFlushProbe,
} from '../src/infrastructure/firebase/runV4PhaseKSyncFlushProbe.js';

const probePath = new URL('../src/infrastructure/firebase/runV4PhaseKSyncFlushProbe.js', import.meta.url);
const selectorPath = new URL('../src/modules/trips/tripRepositorySelector.js', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);

function fakeDb(projectId = 'atlasmap-dev') {
  return { app: { options: { projectId } } };
}

function successfulHarness({ readRemoteTrip } = {}) {
  const calls = {
    clearUserData: [],
    commitIntent: [],
    saveNow: 0,
    telemetryFlush: 0,
    deleteRemoteTrip: [],
    stop: 0,
    compositionArgs: null,
  };
  const localPersistence = {
    async clearUserData(userId) {
      calls.clearUserData.push(userId);
    },
  };
  const syncTelemetryEmitter = {
    async flush() {
      calls.telemetryFlush += 1;
      return true;
    },
    stop() {},
  };
  const crossContextNotifier = {
    publish() {},
    subscribe() { return () => {}; },
    close() {},
  };
  const compositionFactory = (args) => {
    calls.compositionArgs = args;
    return {
      runtime: {
        async commitIntent(intent) {
          calls.commitIntent.push(intent);
          return { discarded: false, mutation: { entityKey: 'synthetic' } };
        },
        async saveNow() {
          calls.saveNow += 1;
          return {
            leader: true,
            attempted: 1,
            synced: 1,
            retried: 0,
            conflicts: 0,
            pending: 0,
          };
        },
      },
      async stop() {
        calls.stop += 1;
      },
    };
  };
  const defaultRead = async ({ tripId }) => ({
    id: tripId,
    schemaVersion: 4,
    status: 'active',
    version: 1,
  });
  const deleteRemoteTrip = async (input) => {
    calls.deleteRemoteTrip.push(input);
    return true;
  };

  return {
    calls,
    options: {
      localPersistence,
      syncTelemetryEmitter,
      crossContextNotifier,
      compositionFactory,
      readRemoteTrip: readRemoteTrip || defaultRead,
      deleteRemoteTrip,
    },
  };
}

test('genera ids unicos dentro del namespace sintetico Phase K', () => {
  const id = createPhaseKSyncFlushTripId(
    () => 'A1B2C3D4-E5F6-47A8-9012-ABCDEF123456'
  );
  assert.equal(id, 'phase-k-e2e-a1b2c3d4e5f647a89012abcdef123456');
  assert.match(id, /^phase-k-e2e-[a-z0-9_-]{8,80}$/);
});

test('intent del probe crea exactamente un root trip v4 desde missing', () => {
  const tripId = 'phase-k-e2e-12345678';
  assert.deepEqual(createPhaseKSyncFlushIntent({ uid: 'alice', tripId }), {
    userId: 'alice',
    tripId,
    entityType: 'trip',
    entityId: tripId,
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: {
      id: tripId,
      name: 'Phase K sync flush probe',
      currency: 'MXN',
    },
  });
  assert.throws(
    () => createPhaseKSyncFlushIntent({ uid: 'alice', tripId: 'normal-trip' }),
    /namespace sintetico/
  );
});

test('probe exitoso ejecuta una mutacion, valida remoto, vacia telemetria y limpia', async () => {
  const tripId = 'phase-k-e2e-success01';
  const harness = successfulHarness();
  const result = await runV4PhaseKSyncFlushProbe({
    uid: 'alice',
    db: fakeDb(),
    confirmation: PHASE_K_SYNC_FLUSH_CONFIRMATION,
    hostname: 'localhost',
    tripId,
    ...harness.options,
  });

  assert.equal(result.project, 'atlasmap-dev');
  assert.equal(result.synthetic, true);
  assert.equal(result.tripId, tripId);
  assert.equal(result.syncFlushE2EPassed, true);
  assert.deepEqual(result.flush, {
    leader: true,
    attempted: 1,
    synced: 1,
    retried: 0,
    conflicts: 0,
    pending: 0,
  });
  assert.deepEqual(result.remote, {
    schemaVersion: 4,
    status: 'active',
    version: 1,
  });
  assert.equal(result.telemetryFlushed, true);
  assert.equal(result.cleanupPassed, true);
  assert.equal(result.localProbeDataCleared, true);
  assert.equal(result.globalStorageV4WriteFlagChanged, false);
  assert.equal(result.productionUntouched, true);

  assert.equal(harness.calls.commitIntent.length, 1);
  assert.equal(harness.calls.saveNow, 1);
  assert.equal(harness.calls.telemetryFlush, 1);
  assert.equal(harness.calls.deleteRemoteTrip.length, 1);
  assert.equal(harness.calls.deleteRemoteTrip[0].tripId, tripId);
  assert.equal(harness.calls.stop, 1);
  assert.ok(harness.calls.clearUserData.length >= 2);
  assert.equal(harness.calls.compositionArgs.coordinatorOptions.maxMutationsPerFlush, 1);
  assert.equal(harness.calls.compositionArgs.uid, 'alice');
});

test('si falla verificacion despues del write, finally intenta borrar el remoto', async () => {
  const tripId = 'phase-k-e2e-cleanup02';
  const harness = successfulHarness({
    async readRemoteTrip() {
      throw new Error('synthetic read failure');
    },
  });

  await assert.rejects(
    runV4PhaseKSyncFlushProbe({
      uid: 'alice',
      db: fakeDb(),
      confirmation: PHASE_K_SYNC_FLUSH_CONFIRMATION,
      hostname: '127.0.0.1',
      tripId,
      ...harness.options,
    }),
    /synthetic read failure/
  );

  assert.equal(harness.calls.saveNow, 1);
  assert.equal(harness.calls.deleteRemoteTrip.length, 1);
  assert.equal(harness.calls.deleteRemoteTrip[0].tripId, tripId);
  assert.equal(harness.calls.stop, 1);
  assert.ok(harness.calls.clearUserData.length >= 2);
});

test('probe falla cerrado por confirmacion, host, proyecto y tripId', async () => {
  const base = {
    uid: 'alice',
    db: fakeDb(),
    hostname: 'localhost',
    tripId: 'phase-k-e2e-guard001',
  };

  await assert.rejects(
    runV4PhaseKSyncFlushProbe({ ...base, confirmation: 'NO' }),
    /confirmacion literal/
  );
  await assert.rejects(
    runV4PhaseKSyncFlushProbe({
      ...base,
      confirmation: PHASE_K_SYNC_FLUSH_CONFIRMATION,
      hostname: 'atlas.example.com',
    }),
    /solo puede ejecutarse desde localhost/
  );
  await assert.rejects(
    runV4PhaseKSyncFlushProbe({
      ...base,
      confirmation: PHASE_K_SYNC_FLUSH_CONFIRMATION,
      db: fakeDb('other-project'),
    }),
    /bloqueado a atlasmap-dev/
  );
  await assert.rejects(
    runV4PhaseKSyncFlushProbe({
      ...base,
      confirmation: PHASE_K_SYNC_FLUSH_CONFIRMATION,
      tripId: 'trip-no-probe',
    }),
    /tripId sintetico/
  );
});

test('probe no esta cableado al repositorio activo ni al App root', async () => {
  const [probeSource, selectorSource, appSource] = await Promise.all([
    readFile(probePath, 'utf8'),
    readFile(selectorPath, 'utf8'),
    readFile(appPath, 'utf8'),
  ]);

  assert.ok(probeSource.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(probeSource.includes("'ATLAS_PHASE_K_SYNTHETIC_V4_WRITE_DEV'"));
  assert.ok(probeSource.includes("const PROBE_DB_NAME = 'atlas-storage-v4-phase-k-e2e'"));
  assert.ok(probeSource.includes('maxMutationsPerFlush: 1'));
  assert.ok(probeSource.includes('remoteMayExist = true'));
  assert.ok(probeSource.includes('await deleteRemoteTrip({ db, uid: userId, tripId })'));
  assert.doesNotMatch(selectorSource, /runV4PhaseKSyncFlushProbe|runCurrentUserV4PhaseKSyncFlushProbe/);
  assert.doesNotMatch(appSource, /runV4PhaseKSyncFlushProbe|runCurrentUserV4PhaseKSyncFlushProbe/);
});
