import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('Gate G READ mantiene separadas las Rules activas v3 y las candidatas READ', async () => {
  const activeConfig = await readJson('firebase.json');
  const readConfig = await readJson('firebase.gate-g-read.json');

  assert.equal(activeConfig.firestore?.rules, 'firestore.rules');
  assert.equal(readConfig.firestore?.rules, 'firestore-gate-g-read.rules');
  assert.equal(readConfig.firestore?.indexes, 'firestore.indexes.json');
  assert.notEqual(activeConfig.firestore?.rules, readConfig.firestore?.rules);
});
