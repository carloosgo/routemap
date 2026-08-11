import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-telemetry-diagnose-dev.ps1', import.meta.url);

test('telemetry diagnose dev esta bloqueado a atlasmap-dev y es read-only', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /\$Project -ne 'atlasmap-dev'/);
  assert.match(source, /functions', 'describe'/);
  assert.match(source, /run', 'services', 'get-iam-policy'/);
  assert.match(source, /Invoke-WebRequest -Uri \$Url -Method Options/);
  assert.doesNotMatch(source, /add-iam-policy-binding/i);
  assert.doesNotMatch(source, /set-iam-policy/i);
  assert.doesNotMatch(source, /functions['\", ]+deploy/i);
  assert.doesNotMatch(source, /run['\", ]+deploy/i);
  assert.doesNotMatch(source, /Invoke-WebRequest[^\n]+-Method (Post|Put|Patch|Delete)/i);
});

test('telemetry diagnose compara callable estable y callable nueva', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /geoapifyCityAutocomplete/);
  assert.match(source, /storageV4SyncTelemetry/);
  assert.match(source, /publicRunInvoker/);
  assert.match(source, /preflightStatus/);
  assert.match(source, /accessControlAllowOrigin/);
});
