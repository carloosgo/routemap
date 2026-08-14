/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(
  new URL('../scripts/runStorageV4PhaseL1LockRulesProd.mjs', import.meta.url)
);
const rulesPath = fileURLToPath(
  new URL('../firestore.l1.prod.locked.rules', import.meta.url)
);
const source = readFileSync(scriptPath, 'utf8');
const rules = readFileSync(rulesPath, 'utf8');

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('L1 locked-rules plan no muta producción', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.phase, 'L1');
  assert.equal(value.mode, 'plan');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.denyAllClientReadsAndWrites, true);
  assert.equal(value.deploysOnlyFirestoreRules, false);
  assert.equal(value.createsWebApp, false);
  assert.equal(value.changesAuth, false);
  assert.equal(value.changesIam, false);
  assert.equal(value.deploysFunctions, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.mutatesApplicationData, false);
  assert.equal(value.productionSecurityMutation, false);
});

test('L1 locked-rules apply exige token exacto', () => {
  const missing = run(['--apply']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /LOCK-ATLAS-V4-PROD-L1-RULES/);

  const wrong = run(['--apply', '--confirm=OTHER']);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /LOCK-ATLAS-V4-PROD-L1-RULES/);
});

test('baseline productivo es deny-all sin excepciones allow true', () => {
  assert.match(rules, /rules_version = '2';/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false;/);
  assert.doesNotMatch(rules, /if true/);
  assert.doesNotMatch(rules, /request\.auth/);
});

test('apply hace preflight antes del deploy y verifica source server-side', () => {
  const preflightIndex = source.indexOf('runStorageV4PhaseL1SecurityPreflightProd.mjs');
  const deployIndex = source.indexOf("'deploy',");
  assert.ok(preflightIndex >= 0);
  assert.ok(deployIndex > preflightIndex);
  assert.match(source, /--only', 'firestore:rules'/);
  assert.match(source, /firebaserules\.googleapis\.com/);
  assert.match(source, /serverSideRulesSourceMatched: true/);
  assert.match(source, /'x-goog-user-project': PROJECT/);
  assert.doesNotMatch(source, /functions:deploy/);
});
