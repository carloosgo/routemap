/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const runnerPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL3PreflightProd.mjs', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [runnerPath, ...args], { encoding: 'utf8', windowsHide: true });
}

test('L3 preflight plan es read-only y target fijo production', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.phase, 'L3');
  assert.equal(value.mode, 'plan');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.webAppDisplayName, 'AtlasMap Web Production');
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.enablesApis, false);
  assert.equal(value.createsRecaptchaKey, false);
  assert.equal(value.registersAppCheck, false);
  assert.equal(value.enablesEnforcement, false);
  assert.equal(value.enablesStorageV4Read, false);
  assert.equal(value.enablesStorageV4Write, false);
});

test('L3 preflight solo admite --check-cloud y no contiene mutaciones REST', () => {
  const invalid = run(['--apply']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Argumento desconocido/);

  const source = readFileSync(runnerPath, 'utf8');
  assert.match(source, /firebaseappcheck\.googleapis\.com/);
  assert.match(source, /recaptchaEnterpriseConfig/);
  assert.match(source, /firebaseappcheck\.googleapis\.com/);
  assert.match(source, /recaptchaenterprise\.googleapis\.com/);
  assert.doesNotMatch(source, /method:\s*['"]PATCH['"]/);
  assert.doesNotMatch(source, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(source, /services',\s*'enable/);
});
