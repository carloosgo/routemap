import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_MIGRATION_CONFIRMATION,
  buildV4MigrationDevPreflight,
  parseV4MigrationDevArgs,
  runV4MigrationDev,
} from './runV4MigrationDev.js';

function legacySource(overrides = {}) {
  const summary = {
    id: 'trip-legacy',
    name: 'Europa',
    currency: 'EUR',
    storageVersion: 3,
    activeRevision: 'revision-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    segmentCount: 0,
    placeCount: 0,
    routeConnectionCount: 0,
    noteCount: 0,
    checklistCount: 0,
    total: 0,
    ...(overrides.summary || {}),
  };
  const revision = {
    id: 'revision-1',
    complete: true,
    segmentCount: 0,
    placeCount: 0,
    routeConnectionCount: 0,
    noteCount: 0,
    checklistCount: 0,
    ...(overrides.revision || {}),
  };
  return {
    summary,
    revision,
    collections: {
      segments: [],
      places: [],
      routeConnections: [],
      notes: [],
      checklist: [],
      ...(overrides.collections || {}),
    },
  };
}

test('migration dev es preflight por defecto y exige un solo uid/trip explícitos', () => {
  assert.deepEqual(
    parseV4MigrationDevArgs(['--uid=alice', '--trip-id=trip-legacy']),
    {
      apply: false,
      uid: 'alice',
      tripId: 'trip-legacy',
      expectedDigest: '',
      confirmation: '',
    }
  );
  assert.throws(() => parseV4MigrationDevArgs([]), /--uid/);
  assert.throws(
    () => parseV4MigrationDevArgs(['--uid=alice', '--trip-id=trip-legacy', '--all']),
    /Argumento desconocido/
  );
});

test('apply exige digest de preflight y confirmación exacta', () => {
  assert.throws(
    () => parseV4MigrationDevArgs(['--uid=alice', '--trip-id=trip-legacy', '--apply']),
    /expected-digest/
  );
  const digest = 'a'.repeat(64);
  assert.throws(
    () => parseV4MigrationDevArgs([
      '--uid=alice',
      '--trip-id=trip-legacy',
      '--apply',
      `--expected-digest=${digest}`,
      '--confirm=NO',
    ]),
    /--confirm=/
  );
  const parsed = parseV4MigrationDevArgs([
    '--uid=alice',
    '--trip-id=trip-legacy',
    '--apply',
    `--expected-digest=${digest}`,
    `--confirm=${V4_MIGRATION_CONFIRMATION}`,
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.expectedDigest, digest);
});

test('preflight materializa sin exponer contenido y declara cero mutaciones', () => {
  const plan = buildV4MigrationDevPreflight({
    uid: 'alice',
    tripId: 'trip-legacy',
    source: legacySource(),
  });

  assert.equal(plan.project, 'atlasmap-dev');
  assert.equal(plan.mode, 'preflight');
  assert.equal(plan.sourceStorageVersion, 3);
  assert.equal(plan.targetSchemaVersion, 4);
  assert.equal(plan.expectedDigest.length, 64);
  assert.deepEqual(plan.entityCounts, {
    segments: 0,
    places: 0,
    connections: 0,
    notes: 0,
    checklist: 0,
  });
  assert.equal(plan.mutatesCloud, false);
  assert.equal(plan.mutatesApplicationData, false);
  assert.equal(JSON.stringify(plan).includes('Europa'), false);
  assert.equal(JSON.stringify(plan).includes('alice'), false);
  assert.equal(JSON.stringify(plan).includes('trip-legacy'), false);
});

test('runner dry-run lee y verifica pero nunca llama migrate', async () => {
  let migrateCalls = 0;
  const logs = [];
  const result = await runV4MigrationDev({
    args: ['--uid=alice', '--trip-id=trip-legacy'],
    db: { fake: true },
    readSource: async () => legacySource(),
    migrate: async () => {
      migrateCalls += 1;
      throw new Error('no debe ejecutarse');
    },
    log: (value) => logs.push(value),
  });

  assert.equal(result.mode, 'preflight');
  assert.equal(migrateCalls, 0);
  assert.match(logs.at(-1), /no se modificó Firestore/i);
});

test('runner apply migra solo cuando el digest fresco coincide con el aprobado', async () => {
  const source = legacySource();
  const preflight = buildV4MigrationDevPreflight({
    uid: 'alice',
    tripId: 'trip-legacy',
    source,
  });
  let migrateCalls = 0;

  const result = await runV4MigrationDev({
    args: [
      '--uid=alice',
      '--trip-id=trip-legacy',
      '--apply',
      `--expected-digest=${preflight.expectedDigest}`,
      `--confirm=${V4_MIGRATION_CONFIRMATION}`,
    ],
    db: { fake: true },
    readSource: async () => source,
    migrate: async () => {
      migrateCalls += 1;
      return {
        state: 'complete',
        version: 1,
        digest: preflight.expectedDigest,
        idempotentReplay: false,
      };
    },
    log: () => {},
  });

  assert.equal(migrateCalls, 1);
  assert.equal(result.mode, 'apply');
  assert.equal(result.state, 'complete');
  assert.equal(result.version, 1);
  assert.equal(result.enablesGlobalStorageV4Write, false);
  assert.equal(result.touchesProduction, false);
});

test('runner aborta antes de migrate si cambió el viaje después del preflight', async () => {
  const approved = buildV4MigrationDevPreflight({
    uid: 'alice',
    tripId: 'trip-legacy',
    source: legacySource(),
  });
  let migrateCalls = 0;

  await assert.rejects(
    runV4MigrationDev({
      args: [
        '--uid=alice',
        '--trip-id=trip-legacy',
        '--apply',
        `--expected-digest=${approved.expectedDigest}`,
        `--confirm=${V4_MIGRATION_CONFIRMATION}`,
      ],
      db: { fake: true },
      readSource: async () => legacySource({ summary: { name: 'Europa editado' } }),
      migrate: async () => {
        migrateCalls += 1;
        return { state: 'complete', version: 1 };
      },
      log: () => {},
    }),
    /digest actual ya no coincide/
  );
  assert.equal(migrateCalls, 0);
});
