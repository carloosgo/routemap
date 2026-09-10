// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('functions/index.js expone backend v4 solo mediante su boundary canónico', async () => {
  const indexSource = await readFile(
    new URL('../../functions/index.js', import.meta.url),
    'utf8'
  );

  assert.match(indexSource, /v4FirestoreEventIngress/);
  assert.match(indexSource, /v4TripLifecycle/);
  assert.match(indexSource, /v4TripPurge/);
  assert.match(indexSource, /from '\.\/v4BackendExports\.js'/);

  assert.doesNotMatch(indexSource, /v4FirestoreEventIngressFunction\.js/);
  assert.doesNotMatch(indexSource, /v4TripLifecycleFunction\.js/);
  assert.doesNotMatch(indexSource, /v4TripPurgeScheduler\.js/);
  assert.doesNotMatch(indexSource, /v4Pilot/i);
});
