import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-telemetry-preflight.ps1', import.meta.url);

test('telemetry preflight solo lee presencia y timestamp de streams conocidos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  for (const stream of [
    'storage_v4_rollout_metric',
    'storage_v4_sync_metric',
    'storage_v4_provider_cache_metric',
    'storage_v4_provider_request_metric',
  ]) {
    assert.match(source, new RegExp(stream));
  }

  assert.match(source, /gcloud logging read/);
  assert.match(source, /--format=json\(timestamp,jsonPayload\.message\)/);
  assert.doesNotMatch(source, /jsonPayload\.(uid|userId|tripId|entityId|payload)/);
  assert.doesNotMatch(source, /logging metrics create/i);
  assert.doesNotMatch(source, /logging sinks create/i);
});
