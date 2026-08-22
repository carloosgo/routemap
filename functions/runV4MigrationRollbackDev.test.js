import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_ROLLBACK_CONFIRMATION,
  parseV4RollbackDevArgs,
  runV4MigrationRollbackDev,
} from './runV4MigrationRollbackDev.js';

function rollbackStatus(overrides = {}) {
  return {
    sourceStorageVersion: 3,
    targetSchemaVersion: 4,
    targetVersion: 1,
    checkpointState: 'complete',
    expectedDigest: 'b'.repeat(64),
    entityCounts: {
      segments: 1,
      places: 2,
      connections: 1,
      notes: 3,
      checklist: 4,
    },
    aggregateContributionCount: 3,
    rollbackEligible: true,
    ...overrides,
  };
}

test('rollback dev es preflight por defecto y rechaza scopes amplios', () => {
  assert.deepEqual(
    parseV4RollbackDevArgs(['--uid=alice', '--trip-id=trip-v4']),
    {
      apply: false,
      uid: 'alice',
      tripId: 'trip-v4',
      expectedDigest: '',
      confirmation: '',
    }
  );
  assert.throws(
    () => parseV4RollbackDevArgs(['--uid=alice', '--trip-id=trip-v4', '--all']),
    /Argumento desconocido/
  );
});

test('rollback apply exige digest y confirmación exacta', () => {
  const digest = 'b'.repeat(64);
  assert.throws(
    () => parseV4RollbackDevArgs(['--uid=alice', '--trip-id=trip-v4', '--apply']),
    /expected-digest/
  );
  const parsed = parseV4RollbackDevArgs([
    '--uid=alice',
    '--trip-id=trip-v4',
    '--apply',
    `--expected-digest=${digest}`,
    `--confirm=${V4_ROLLBACK_CONFIRMATION}`,
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.expectedDigest, digest);
});

test('rollback dry-run verifica elegibilidad sin ejecutar cleanup', async () => {
  let rollbackCalls = 0;
  const logs = [];
  const result = await runV4MigrationRollbackDev({
    args: ['--uid=alice', '--trip-id=trip-v4'],
    db: { fake: true },
    readPreflight: async () => rollbackStatus(),
    rollback: async () => {
      rollbackCalls += 1;
      throw new Error('no debe ejecutarse');
    },
    log: (value) => logs.push(value),
  });

  assert.equal(result.mode, 'preflight');
  assert.equal(result.rollbackEligible, true);
  assert.equal(result.mutatesApplicationData, false);
  assert.equal(rollbackCalls, 0);
  assert.equal(JSON.stringify(result).includes('alice'), false);
  assert.equal(JSON.stringify(result).includes('trip-v4'), false);
  assert.match(logs.at(-1), /no se modificó Firestore/i);
});

test('rollback apply restaura legacy solo con digest fresco aprobado', async () => {
  const status = rollbackStatus();
  let rollbackCalls = 0;
  const result = await runV4MigrationRollbackDev({
    args: [
      '--uid=alice',
      '--trip-id=trip-v4',
      '--apply',
      `--expected-digest=${status.expectedDigest}`,
      `--confirm=${V4_ROLLBACK_CONFIRMATION}`,
    ],
    db: { fake: true },
    readPreflight: async () => status,
    rollback: async () => {
      rollbackCalls += 1;
      return { state: 'rolled-back', idempotentReplay: false };
    },
    log: () => {},
  });

  assert.equal(rollbackCalls, 1);
  assert.equal(result.mode, 'apply');
  assert.equal(result.state, 'rolled-back');
  assert.equal(result.restoredStorageVersion, 3);
  assert.equal(result.physicallyCleansFreshV4Staging, true);
  assert.equal(result.enablesGlobalStorageV4Write, false);
  assert.equal(result.touchesProduction, false);
});

test('rollback aborta antes de cleanup si el digest cambió', async () => {
  let rollbackCalls = 0;
  await assert.rejects(
    runV4MigrationRollbackDev({
      args: [
        '--uid=alice',
        '--trip-id=trip-v4',
        '--apply',
        `--expected-digest=${'a'.repeat(64)}`,
        `--confirm=${V4_ROLLBACK_CONFIRMATION}`,
      ],
      db: { fake: true },
      readPreflight: async () => rollbackStatus(),
      rollback: async () => {
        rollbackCalls += 1;
        return { state: 'rolled-back' };
      },
      log: () => {},
    }),
    /digest v4 actual ya no coincide/
  );
  assert.equal(rollbackCalls, 0);
});
