import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/deployStorageV4PhaseKTelemetryDev.mjs', import.meta.url);

test('Phase K telemetry deploy usa el script JS de firebase-tools y no ejecuta firebase.cmd directamente', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /firebase-tools/);
  assert.match(source, /packageJson\.bin\?\.firebase/);
  assert.match(source, /spawnSync\(\s*process\.execPath/);
  assert.doesNotMatch(source, /firebase\.cmd/);
});

test('Phase K telemetry deploy sigue bloqueado a atlasmap-dev y al subset observacional', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /const PROJECT = 'atlasmap-dev'/);
  assert.match(source, /'storageV4SyncTelemetry'/);
  assert.match(source, /'geoapifyCityAutocomplete'/);
  assert.match(source, /enablesStorageV4Write: false/);
  assert.match(source, /touchesProduction: false/);
});
