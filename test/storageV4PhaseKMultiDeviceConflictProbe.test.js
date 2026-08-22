import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE_K_MULTIDEVICE_CONFIRMATION,
  createPhaseKMultiDeviceCreateIntent,
  createPhaseKMultiDeviceTripId,
  createPhaseKMultiDeviceUpdateIntent,
} from '../src/infrastructure/firebase/runV4PhaseKMultiDeviceConflictProbe.js';

const probePath = new URL('../src/infrastructure/firebase/runV4PhaseKMultiDeviceConflictProbe.js', import.meta.url);
const selectorPath = new URL('../src/modules/trips/tripRepositorySelector.js', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);

test('multi-device probe genera tripId unicamente en namespace sintetico', () => {
  const id = createPhaseKMultiDeviceTripId(
    () => 'ABCDEF12-3456-4789-ABCD-0123456789EF'
  );
  assert.equal(id, 'phase-k-e2e-abcdef1234564789abcd0123456789ef');
  assert.match(id, /^phase-k-e2e-[a-z0-9_-]{8,80}$/);
});

test('setup intent crea exactamente un root trip v4 desde missing', () => {
  const tripId = 'phase-k-e2e-base0001';
  assert.deepEqual(createPhaseKMultiDeviceCreateIntent({ uid: 'alice', tripId }), {
    userId: 'alice',
    tripId,
    entityType: 'trip',
    entityId: tripId,
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: {
      id: tripId,
      name: 'Phase K multi-device base',
      currency: 'MXN',
    },
  });
});

test('roles A/B generan updates incompatibles desde la misma base version 1', () => {
  const tripId = 'phase-k-e2e-stale001';
  const a = createPhaseKMultiDeviceUpdateIntent({
    uid: 'alice',
    tripId,
    role: 'A',
    baseVersion: 1,
  });
  const b = createPhaseKMultiDeviceUpdateIntent({
    uid: 'alice',
    tripId,
    role: 'B',
    baseVersion: 1,
  });

  assert.equal(a.serverVersion, 1);
  assert.equal(b.serverVersion, 1);
  assert.equal(a.serverStatus, 'active');
  assert.equal(b.serverStatus, 'active');
  assert.equal(a.entityType, 'trip');
  assert.equal(b.entityType, 'trip');
  assert.notEqual(a.payload.name, b.payload.name);
  assert.equal(a.payload.currency, 'MXN');
  assert.equal(b.payload.currency, 'MXN');
});

test('probe falla cerrado en inputs de intent invalidos', () => {
  assert.throws(
    () => createPhaseKMultiDeviceCreateIntent({ uid: 'alice', tripId: 'normal-trip' }),
    /namespace sintetico/
  );
  assert.throws(
    () => createPhaseKMultiDeviceUpdateIntent({
      uid: 'alice',
      tripId: 'phase-k-e2e-valid001',
      role: 'C',
      baseVersion: 1,
    }),
    /role debe ser A o B/
  );
  assert.throws(
    () => createPhaseKMultiDeviceUpdateIntent({
      uid: 'alice',
      tripId: 'phase-k-e2e-valid001',
      role: 'A',
      baseVersion: 0,
    }),
    /baseVersion debe ser entero positivo/
  );
});

test('probe queda manual, aislado por role y limitado a una mutacion por flush', async () => {
  const [source, selectorSource, appSource] = await Promise.all([
    readFile(probePath, 'utf8'),
    readFile(selectorPath, 'utf8'),
    readFile(appPath, 'utf8'),
  ]);

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes(PHASE_K_MULTIDEVICE_CONFIRMATION));
  assert.ok(source.includes("dbName: 'atlas-storage-v4-phase-k-md-a'"));
  assert.ok(source.includes("dbName: 'atlas-storage-v4-phase-k-md-b'"));
  assert.ok(source.includes("channelName: 'atlas-storage-v4-phase-k-md-a'"));
  assert.ok(source.includes("channelName: 'atlas-storage-v4-phase-k-md-b'"));
  assert.ok(source.includes('coordinatorOptions: { maxMutationsPerFlush: 1 }'));
  assert.ok(source.includes('solo puede ejecutarse desde localhost'));
  assert.ok(source.includes('esta bloqueado a ${PROJECT}'));
  assert.doesNotMatch(selectorSource, /runV4PhaseKMultiDeviceConflictProbe/);
  assert.doesNotMatch(appSource, /runV4PhaseKMultiDeviceConflictProbe/);
});

test('flujo preparado exige winner A version 2 y loser B conflicto explicito sin mutacion pendiente', async () => {
  const source = await readFile(probePath, 'utf8');

  assert.ok(source.includes("version: 2,\n      name: ROLE_CONFIG.A.desiredName"));
  assert.ok(source.includes('summary.conflicts !== 1'));
  assert.ok(source.includes('local.state !== V4_LOCAL_STATES.CONFLICT'));
  assert.ok(source.includes('local.payload?.name !== ROLE_CONFIG.B.desiredName'));
  assert.ok(source.includes('local.conflict?.payload?.name !== ROLE_CONFIG.A.desiredName'));
  assert.ok(source.includes("if (pendingMutation) throw new Error('Role B con conflicto no debe conservar mutacion pendiente.')"));
  assert.ok(source.includes('noSilentLoss: true'));
  assert.ok(source.includes('await deleteDoc(doc(db, `users/${userId}/trips/${tripId}`))'));
  assert.ok(source.includes('globalStorageV4WriteFlagChanged: false'));
  assert.ok(source.includes('productionUntouched: true'));
});
