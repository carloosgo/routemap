/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL1CreateWebAppProd.mjs', import.meta.url));
const clientPath = fileURLToPath(new URL('../src/infrastructure/firebase/firebaseClient.js', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');
const clientSource = readFileSync(clientPath, 'utf8');

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', windowsHide: true });
}

test('L1 Web App plan es fail-closed y no muta producción', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.phase, 'L1');
  assert.equal(value.mode, 'plan');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.displayName, 'AtlasMap Web Production');
  assert.equal(value.createsExactlyOneFirebaseWebApp, false);
  assert.equal(value.opensFirestoreRules, false);
  assert.equal(value.changesAuthProviders, false);
  assert.equal(value.createsStorageBucket, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.mutatesApplicationData, false);
});

test('L1 Web App apply exige token exacto', () => {
  const missing = run(['--apply']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /CREATE-ATLAS-V4-PROD-WEB-APP/);
  const wrong = run(['--apply', '--confirm=OTHER']);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /CREATE-ATLAS-V4-PROD-WEB-APP/);
});

test('runner usa Firebase Management REST, quota project y espera operation', () => {
  assert.match(source, /projects\/\$\{PROJECT\}\/webApps/);
  assert.match(source, /'x-goog-user-project': PROJECT/);
  assert.match(source, /waitOperation/);
  assert.match(source, /sdkConfigProjectMatches: true/);
  assert.match(source, /apiKeyPrinted: false/);
  assert.match(source, /writesEnvironmentFiles: false/);
});

test('runner exige una sola Web App esperada y soporta reintento idempotente', () => {
  assert.match(source, /apps\.length !== 1 \|\| expectedBefore\.length !== 1/);
  assert.match(source, /let state = 'already-present'/);
  assert.match(source, /state = 'created'/);
  assert.match(source, /Post-check inválido/);
});

test('Firebase client no exige Cloud Storage si Atlas solo usa Auth y Firestore', () => {
  const requiredBlock = clientSource.match(/const required = \[([\s\S]*?)\];/);
  assert.ok(requiredBlock);
  assert.doesNotMatch(requiredBlock[1], /storageBucket/);
  assert.match(clientSource, /getAuth\(app\)/);
  assert.match(clientSource, /getFirestore\(app\)/);
});
