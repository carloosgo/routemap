// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el deploy actual de preprod está acotado, validado y no toca producción', async () => {
  const source = await read('scripts/runPreprodCurrentDeploy.mjs');

  assert.match(source, /PREPROD_CITY_FUNCTION = 'geoapifyCityAutocomplete'/);
  assert.match(source, /touchesProduction: false/);
  assert.match(source, /deploysFirestoreRules: false/);
  assert.match(source, /deploysFirestoreIndexes: false/);
  assert.match(source, /`functions:\$\{PREPROD_CITY_FUNCTION\}`/);
  assert.match(source, /'--only',[\s\S]*?'hosting'/);
  assert.doesNotMatch(source, /'--only',[\s\S]*?'functions',[\s\S]*?'--project'/);
  assert.match(source, /run\(npm, \['run', 'verify:local'\]\)/);
  assert.match(source, /run\(npm, \['run', 'test:rules'\]\)/);
  assert.match(source, /await validateBuiltPreprodBundle\(\)/);
  assert.match(source, /run\(npx, functionDeployCommand\(\)\);\s*run\(npx, hostingDeployCommand\(\)\);/);
  assert.match(source, /applyRequiresExplicitFlag: '--apply'/);
});
