import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIndexedDbV4LocalPersistence } from '../src/modules/storage-v4/indexedDbLocalPersistence.js';

const sourceUrl = new URL('../src/modules/storage-v4/indexedDbLocalPersistence.js', import.meta.url);

test('adaptador web falla explícitamente fuera de un entorno con IndexedDB', () => {
  assert.throws(
    () => createIndexedDbV4LocalPersistence({ indexedDb: null }),
    /IndexedDB no está disponible/
  );
});

test('IndexedDB v4 mantiene stores separados y operaciones críticas readwrite', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const store of ['drafts', 'entities', 'mutations', 'meta']) {
    assert.match(source, new RegExp(`["']${store}["']`));
  }
  assert.match(source, /keyPath: 'entityKey'/);
  assert.match(source, /transaction\('mutations', 'readwrite'\)/);
  assert.match(source, /transaction\('meta', 'readwrite'\)/);
  assert.match(source, /deleteMutationIfRevision/);
  assert.match(source, /tryAcquireSyncLease/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
