import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/deployStorageV4PhaseKTelemetryDev.mjs', import.meta.url);

test('Phase K telemetry deploy usa el script JS de firebase-tools y no ejecuta firebase.cmd directamente', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('firebase-tools'));
  assert.ok(source.includes('packageJson.bin?.firebase'));
  assert.ok(source.includes('spawnSync('));
  assert.ok(source.includes('process.execPath'));
  assert.equal(source.includes('firebase.cmd'), false);
});

test('Phase K telemetry deploy sigue bloqueado a atlasmap-dev y al subset observacional', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("'storageV4SyncTelemetry'"));
  assert.ok(source.includes("'geoapifyCityAutocomplete'"));
  assert.ok(source.includes('enablesStorageV4Write: false'));
  assert.ok(source.includes('touchesProduction: false'));
});
