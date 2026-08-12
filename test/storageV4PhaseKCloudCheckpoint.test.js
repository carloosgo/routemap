import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/runStorageV4PhaseKCloudCheckpoint.mjs', import.meta.url);

test('cloud checkpoint de Phase K agrupa solo preflights read-only', async () => {
  const source = await readFile(scriptPath, 'utf8');

  for (const script of [
    'runStorageV4PhaseKPreflight.mjs',
    'runStorageV4PhaseKSloPreflight.mjs',
    'runStorageV4PhaseKObservabilityPreflight.mjs',
    'runStorageV4PhaseKRestorePreflight.mjs',
  ]) {
    assert.ok(source.includes(script));
  }

  assert.ok(source.includes("project: 'atlasmap-dev'"));
  assert.ok(source.includes('mutatesCloud: false'));
  assert.ok(source.includes('touchesProduction: false'));
  assert.equal(source.includes('--apply'), false);
  assert.equal(source.includes('ObservabilityApplyDev'), false);
  assert.equal(source.includes('RestoreDrillDev'), false);
});
