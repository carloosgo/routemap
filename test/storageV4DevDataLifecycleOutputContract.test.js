import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dev lifecycle output states TTL deletion side effects explicitly', async () => {
  const source = await readFile('scripts/runStorageV4DevDataLifecycle.mjs', 'utf8');

  assert.match(source, /ttlActivationCanDeleteAlreadyExpiredDocuments: true/);
  assert.match(source, /ttlDeletesArePerformedByFirestore: true/);
  assert.match(source, /ttlDeleteOperationsAreBillable: true/);
  assert.match(source, /dryRunDeletesDocuments: false/);
  assert.match(source, /expiredDocumentsMayBeDeletedOnlyAfterTtlPoliciesBecomeActive/);
  assert.doesNotMatch(source, /mayDeleteAlreadyExpiredDocumentsAfterTtlActivation/);
});
