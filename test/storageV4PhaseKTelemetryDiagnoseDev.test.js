import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-telemetry-diagnose-dev.ps1', import.meta.url);

test('telemetry diagnose dev esta bloqueado a atlasmap-dev y es read-only', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes("'functions', 'describe'"));
  assert.ok(source.includes("'run', 'services', 'get-iam-policy'"));
  assert.ok(source.includes('Invoke-WebRequest -Uri $Url -Method Options'));
  assert.equal(source.includes('add-iam-policy-binding'), false);
  assert.equal(source.includes('set-iam-policy'), false);
  assert.equal(source.includes("'functions', 'deploy'"), false);
  assert.equal(source.includes("'run', 'deploy'"), false);

  const mutatingWebMethods = ['-Method Post', '-Method Put', '-Method Patch', '-Method Delete'];
  for (const method of mutatingWebMethods) {
    assert.equal(source.includes(method), false);
  }
});

test('telemetry diagnose compara callable estable y callable nueva', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('geoapifyCityAutocomplete'));
  assert.ok(source.includes('storageV4SyncTelemetry'));
  assert.ok(source.includes('publicRunInvoker'));
  assert.ok(source.includes('preflightStatus'));
  assert.ok(source.includes('accessControlAllowOrigin'));
});
