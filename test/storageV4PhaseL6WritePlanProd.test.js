/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL6WritePlanProd.mjs', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', windowsHide: true });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('L6 exige cohorte explícita y nunca activa WRITE', () => {
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cohort-percent/);

  const value = json(run(['--cohort-percent=1']));
  assert.equal(value.phase, 'L6');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.mode, 'plan-only');
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.targetRemoteConfig.storage_v4_mode, 'pilot');
  assert.equal(value.targetRemoteConfig.storage_v4_write_rules_ready, true);
});

test('L6 conserva rollback a READ sin WRITE', () => {
  const value = json(run(['--cohort-percent=0.5']));
  assert.equal(value.rollbackRemoteConfig.storage_v4_mode, 'read');
  assert.equal(value.rollbackRemoteConfig.storage_v4_read_rules_ready, true);
  assert.equal(value.rollbackRemoteConfig.storage_v4_write_rules_ready, false);
  assert.equal(value.rollbackRemoteConfig.storage_v4_sync_ready, false);
  assert.equal(value.emergencyKillSwitch.storage_v4_kill_switch, true);
  assert.equal(value.emergencyKillSwitch.storage_v4_cohort_percent, 0);
});

test('L6 rechaza apply y cohortes inválidas', () => {
  for (const cohort of ['0', '-1', '101', 'abc']) {
    assert.notEqual(run([`--cohort-percent=${cohort}`]).status, 0);
  }
  const apply = run(['--cohort-percent=1', '--apply']);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /plan-only/);
});