/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL4ReadPlanProd.mjs', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', windowsHide: true });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('L4 exige cohorte explícita y nunca aplica cambios', () => {
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cohort-percent/);

  const value = json(run(['--cohort-percent=1']));
  assert.equal(value.phase, 'L4');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.mode, 'plan');
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.enablesStorageV4Read, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.requestedCohortPercent, 1);
  assert.equal(value.targetRemoteConfig.storage_v4_mode, 'read');
  assert.equal(value.targetRemoteConfig.storage_v4_write_rules_ready, false);
});

test('L4 rechaza cohortes inválidas y cualquier apply', () => {
  for (const value of ['0', '-1', '101', 'abc']) {
    const result = run([`--cohort-percent=${value}`]);
    assert.notEqual(result.status, 0);
  }

  const apply = run(['--cohort-percent=1', '--apply']);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /plan-only/);
});

test('L4 conserva rollback fail-closed', () => {
  const value = json(run(['--cohort-percent=0.5']));
  assert.deepEqual(value.rollbackRemoteConfig, {
    storage_v4_enabled: false,
    storage_v4_kill_switch: true,
    storage_v4_mode: 'off',
    storage_v4_cohort_percent: 0,
    storage_v4_read_rules_ready: false,
  });
  assert.ok(value.requiredPrerequisites.includes('L2 recovery/cost PASS'));
  assert.ok(value.requiredPrerequisites.includes('L3 App Check observation ready'));
});