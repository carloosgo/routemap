import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/deployStorageV4PhaseKTelemetryDev.mjs', import.meta.url);

test('telemetry deploy de Phase K queda bloqueado a atlasmap-dev', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /const PROJECT = 'atlasmap-dev'/);
  assert.match(source, /'storageV4SyncTelemetry'/);
  assert.match(source, /'geoapifyCityAutocomplete'/);
  assert.match(source, /'--only'/);
  assert.match(source, /'--project'/);
  assert.match(source, /'--non-interactive'/);
  assert.match(source, /includes\('--apply'\)/);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|functions:v4Trip|functions:v4Aggregate/i);
});

test('telemetry deploy no habilita write v4 ni despliega migración o lifecycle', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /enablesStorageV4Write: false/);
  assert.match(source, /touchesProduction: false/);
  assert.doesNotMatch(source, /storageV4Migration|storageV4Purge|storageV4Lifecycle|storageV4Aggregate/);
});
