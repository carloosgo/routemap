import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/deployStorageV4PhaseKTelemetryDev.mjs', import.meta.url);

test('telemetry deploy de Phase K queda bloqueado a atlasmap-dev', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("'storageV4SyncTelemetry'"));
  assert.ok(source.includes("'geoapifyCityAutocomplete'"));
  assert.ok(source.includes("'--only'"));
  assert.ok(source.includes("'--project'"));
  assert.ok(source.includes("'--non-interactive'"));
  assert.ok(source.includes("includes('--apply')"));
  assert.doesNotMatch(source, /atlasmap-prod|production-project|functions:v4Trip|functions:v4Aggregate/i);
});

test('telemetry deploy no habilita write v4 ni despliega migracion o lifecycle', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('enablesStorageV4Write: false'));
  assert.ok(source.includes('touchesProduction: false'));
  for (const forbidden of [
    'storageV4Migration',
    'storageV4Purge',
    'storageV4Lifecycle',
    'storageV4Aggregate',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
