import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const validatorPath = new URL('../scripts/validateStorageV4PhaseKRestore.mjs', import.meta.url);
const checkpointPath = new URL('../scripts/storage-v4-phase-k-restore-checkpoint-dev.ps1', import.meta.url);

test('restore content validator queda bloqueado a atlasmap-dev y named drill database', async () => {
  const source = await readFile(validatorPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("const SOURCE_DB = '(default)'"));
  assert.ok(source.includes('/^atlas-restore-drill-[a-z0-9-]+$/'));
  assert.ok(source.includes('MAX_DOCUMENTS = 10_000'));
  assert.equal(source.includes('firebase-admin'), false);
});

test('restore content validator usa solo REST de lectura y hashes de fields', async () => {
  const source = await readFile(validatorPath, 'utf8');

  assert.ok(source.includes(':listCollectionIds'));
  assert.ok(source.includes('readTime'));
  assert.ok(source.includes('digestFields(doc.fields)'));
  assert.ok(source.includes("createHash('sha256')"));
  assert.ok(source.includes('exposesDocumentContent: false'));
  assert.ok(source.includes('mutatesCloud: false'));
  assert.equal(source.includes("method: 'DELETE'"), false);
  assert.equal(source.includes("method: 'PATCH'"), false);
  assert.equal(source.includes("method: 'PUT'"), false);
});

test('restore checkpoint inyecta token temporal sin imprimirlo y conserva la base si falla validacion', async () => {
  const source = await readFile(checkpointPath, 'utf8');

  assert.ok(source.includes('gcloud auth print-access-token'));
  assert.ok(source.includes('$env:ATLAS_GCLOUD_ACCESS_TOKEN = $accessToken'));
  assert.ok(source.includes('Remove-Item Env:ATLAS_GCLOUD_ACCESS_TOKEN'));
  assert.ok(source.includes('validateStorageV4PhaseKRestore.mjs'));
  assert.ok(source.includes('Se conserva intacta para diagnostico'));
  assert.equal(source.includes("'firestore', 'databases', 'delete'"), false);
});
