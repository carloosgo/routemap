/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(
  new URL('../scripts/runStorageV4PhaseL1SecurityPreflightProd.mjs', import.meta.url)
);
const source = readFileSync(scriptPath, 'utf8');

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('L1 local-plan es fijo a atlasmap-prod/us-central1 y no muta Cloud', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.phase, 'L1');
  assert.equal(value.mode, 'local-plan');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.location, 'us-central1');
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.changesIam, false);
  assert.equal(value.changesRules, false);
  assert.equal(value.createsWebApp, false);
  assert.equal(value.changesAuth, false);
  assert.equal(value.deploysFunctions, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.mutatesApplicationData, false);
});

test('L1 rechaza argumentos no declarados, incluido apply', () => {
  const result = run(['--apply']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Argumento desconocido: --apply/);
});

test('L1 cloud check usa quota-project y lecturas explícitas de Web Apps/collections', () => {
  assert.match(source, /'x-goog-user-project': PROJECT/);
  assert.match(source, /projects\/\$\{PROJECT\}\/webApps\?pageSize=100/);
  assert.match(source, /documents:listCollectionIds/);
  assert.match(source, /body: \{ pageSize: 1 \}/);
  assert.doesNotMatch(source, /services enable/);
  assert.doesNotMatch(source, /firebase deploy/);
  assert.doesNotMatch(source, /--apply/);
});

test('L1 conserva hardening Windows para gcloud en rutas con espacios', () => {
  assert.match(source, /const candidates = \['gcloud\.cmd', 'gcloud\.exe', 'gcloud'\]/);
  assert.match(source, /const command = hasPath \? basename\(executable\) : executable/);
  assert.match(source, /cwd: dirname\(executable\)/);
});
