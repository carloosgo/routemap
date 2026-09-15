import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../scripts/runStorageV4AtlasCostScenarios.mjs', import.meta.url));

const validInput = {
  classification: 'simulation',
  assumptionsAsOf: '2026-08-12',
  assumptionsBasis: 'fixture de prueba; no forecast',
  capacityAssumptions: {
    sessionsPerActiveUserPerDay: 1,
    firestoreReadsPerSession: 10,
    logicalMutationsPerSession: 2,
    firestoreWritesPerLogicalMutation: 1,
    firestoreDeletesPerSession: 0,
    functionInvocationsPerSession: 1,
    providerLookupsPerSession: 1,
    providerCacheHitRate: 0.5,
  },
  priceBook: {
    daysPerMonth: 30,
    firestoreReadUsdPer100k: 0.03,
    firestoreWriteUsdPer100k: 0.09,
    firestoreDeleteUsdPer100k: 0.01,
    functionInvocationUsdPerMillion: 0.4,
    providerRequestUsdEach: 0,
    canonicalStorageGiBPerActiveUser: 0,
    canonicalStorageUsdPerGiBMonth: 0.15,
    pitrStorageGiBPerActiveUser: 0,
    pitrStorageUsdPerGiBMonth: 0.15,
    backupStorageGiBPerActiveUser: 0,
    backupStorageUsdPerGiBMonth: 0.03,
    objectStorageGiBPerActiveUser: 0,
    objectStorageUsdPerGiBMonth: 0,
  },
};

async function withInput(input, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-cost-'));
  const path = join(dir, 'input.json');
  await writeFile(path, JSON.stringify(input), 'utf8');
  try {
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('runner exige archivo explícito y no tiene supuestos monetarios default', () => {
  const result = spawnSync(process.execPath, [runner], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--input es obligatorio/);
});

test('simulation queda marcada como no elegible para forecast', async () => {
  await withInput(validInput, async (path) => {
    const result = spawnSync(process.execPath, [runner, `--input=${path}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.project, 'atlasmap-dev');
    assert.equal(output.classification, 'simulation');
    assert.equal(output.forecastEligible, false);
    assert.equal(output.mutatesCloud, false);
    assert.equal(output.touchesProduction, false);
    assert.deepEqual(output.scenarios.map((item) => item.activeUsers), [1000, 10000, 50000, 100000]);
  });
});

test('measured puede quedar elegible solo si trae metadata y números explícitos', async () => {
  await withInput({ ...validInput, classification: 'measured' }, async (path) => {
    const result = spawnSync(process.execPath, [runner, `--input=${path}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).forecastEligible, true);
  });

  await withInput({
    ...validInput,
    classification: 'measured',
    capacityAssumptions: { ...validInput.capacityAssumptions, firestoreReadsPerSession: null },
  }, async (path) => {
    const result = spawnSync(process.execPath, [runner, `--input=${path}`], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /firestoreReadsPerSession/);
  });
});
