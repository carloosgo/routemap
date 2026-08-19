// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('bundle pilot sigue fuera de functions/index.js hasta autorización explícita', async () => {
  const indexSource = await readFile(
    new URL('../../functions/index.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(indexSource, /v4PilotBackendBundle/);
  assert.doesNotMatch(indexSource, /v4FirestoreEventIngressFunction/);
  assert.doesNotMatch(indexSource, /v4TripLifecycleFunction/);
  assert.doesNotMatch(indexSource, /v4TripPurgeScheduler/);
});
