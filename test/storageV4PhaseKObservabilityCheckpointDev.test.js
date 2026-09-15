import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/runStorageV4PhaseKObservabilityCheckpointDev.mjs', import.meta.url);

test('observability checkpoint dev esta bloqueado al scope permitido', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("project: 'atlasmap-dev'"));
  assert.ok(source.includes('mutatesBudgets: false'));
  assert.ok(source.includes('enablesStorageV4Write: false'));
  assert.ok(source.includes('performsRestore: false'));
  assert.ok(source.includes('deletesResources: false'));
  assert.ok(source.includes('touchesProduction: false'));
  assert.ok(source.includes('runStorageV4PhaseKObservabilityApplyDev.mjs'));
  assert.ok(source.includes('runStorageV4PhaseKCloudCheckpoint.mjs'));
});

test('observability checkpoint requiere --apply para mutar y hace checkpoint read-only despues', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("includes('--apply')"));
  assert.ok(source.includes("run(applyScript, ['--apply'])"));
  assert.ok(source.includes('run(checkpointScript)'));
  assert.ok(source.includes('Dry-run completado'));
  assert.equal(source.includes('RestoreDrillDev'), false);
  assert.equal(source.includes('BudgetCreate'), false);
});
