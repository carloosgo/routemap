// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const runtimeRoots = [
  new URL('../../src/infrastructure/firebase/', import.meta.url),
  new URL('../../src/modules/storage-v4/', import.meta.url),
  new URL('../../functions/', import.meta.url),
];

const forbiddenContent = [
  /firestoreV4PilotTripWriter/,
  /createFirestoreV4PilotTripWriter/,
  /gateGRuntimeConfigModel/,
  /tripStorageSchema/,
  /firestore-v4\.rules/,
];

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === 'node_modules') continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), root);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(url));
    } else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) {
      files.push(url);
    }
  }
  return files;
}

test('runtime Storage v4 no conserva nombres ni dependencias de la transición', async () => {
  const files = (await Promise.all(runtimeRoots.map(sourceFiles))).flat();
  assert.ok(files.length > 0);

  for (const file of files) {
    const path = file.pathname;
    assert.doesNotMatch(path, /(?:pilot|gate.?g|hybrid|v3)/i, `Nombre transicional en ${path}`);
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenContent) {
      assert.doesNotMatch(source, pattern, `Residuo transicional en ${path}: ${pattern}`);
    }
  }
});
