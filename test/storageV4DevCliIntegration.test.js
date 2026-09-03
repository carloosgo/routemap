import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

test('dev cloud verifiers share the Windows-safe CLI launcher', () => {
  for (const file of [
    'scripts/runStorageV4DevStageVerify.mjs',
    'scripts/runStorageV4DevPlatformParityPreflight.mjs',
  ]) {
    const value = source(file);
    assert.match(value, /from '\.\/crossPlatformCli\.mjs'/, `${file} debe usar el helper compartido`);
    assert.doesNotMatch(value, /from 'node:child_process'/, `${file} no debe volver a ejecutar CLIs directamente`);
    assert.doesNotMatch(value, /spawnSync\(/, `${file} no debe reintroducir spawnSync directo`);
  }
});

test('canonical stage verifier resolves gcloud through the shared launcher', () => {
  const value = source('scripts/runStorageV4DevStageVerify.mjs');
  assert.match(value, /resolveCliCommand\('gcloud'\)/);
  assert.match(value, /runCliProcess\(gcloud, \['auth', 'print-access-token'\]\)/);
});
