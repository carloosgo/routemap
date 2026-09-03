import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowPath = new URL('../.github/workflows/dependency-audit.yml', import.meta.url);

test('dependency audit usa un cliente npm actual y conserva el umbral de seguridad', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(source, /node-version:\s*22/);
  assert.match(source, /npm install --global npm@12\.0\.2/);
  assert.match(source, /test "\$\(npm --version\)" = "12\.0\.2"/);
  assert.match(source, /npm audit --omit=dev --audit-level=high/);
  assert.match(source, /npm audit --prefix functions --omit=dev --audit-level=high/);
  assert.doesNotMatch(source, /audit-level=(?:moderate|low)/);
  assert.doesNotMatch(source, /continue-on-error:\s*true/);
});
