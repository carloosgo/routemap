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

test('intención local IndexedDB actualiza entidad y cola en una sola transacción', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /commitLocalIntent/);
  assert.match(
    source,
    /transaction\(\['entities', 'mutations'\], 'readwrite'\)/
  );
  assert.match(source, /planLocalEntityIntent/);
  assert.match(source, /entities\.get\(entityKey\)/);
  assert.match(source, /mutations\.get\(entityKey\)/);
});

test('ack IndexedDB comprueba lease, entidad y mutación dentro de una sola transacción', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /acknowledgeSyncedMutation/);
  assert.match(
    source,
    /transaction\(\['entities', 'mutations', 'meta'\], 'readwrite'\)/
  );
  assert.match(source, /planSyncAcknowledgement/);
  assert.match(source, /meta\.get\(LEASE_KEY\)/);
  assert.match(source, /entities\.get\(sentMutation\.entityKey\)/);
  assert.match(source, /mutations\.get\(sentMutation\.entityKey\)/);
});
