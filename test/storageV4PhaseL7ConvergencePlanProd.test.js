/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/runStorageV4PhaseL7ConvergencePlanProd.mjs', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true });
}

function parse(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('L7 exige porcentaje explícito', () => {
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical-percent/);
});

test('L7 es plan-only y no admite apply', () => {
  const result = run(['--canonical-percent=10', '--apply']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plan-only/);
});

test('L7 no permite retirar v3 antes de 100%', () => {
  const result = run(['--canonical-percent=99', '--retire-v3']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /100/);
});

test('L7 100% conserva guardas de retiro y no muta', () => {
  const value = parse(run(['--canonical-percent=100', '--retire-v3']));
  assert.equal(value.phase, 'L7');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.mode, 'plan-only');
  assert.equal(value.requestedCanonicalV4Percent, 100);
  assert.equal(value.requestsV3Retirement, true);
  assert.equal(value.prerequisites.deleteRemainsUserIrreversible, true);
  assert.equal(value.v3RetirementGate.requiresFinalBackupBeforeRetirement, true);
  assert.equal(value.v3RetirementGate.allowsUserTripRestore, false);
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.retiresV3, false);
});
