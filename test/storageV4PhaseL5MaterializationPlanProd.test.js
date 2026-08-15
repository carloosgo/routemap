/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL5MaterializationPlanProd.mjs', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', windowsHide: true });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('L5 exige tamaño de muestra explícito y nunca materializa', () => {
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /trip-count/);

  const value = json(run(['--trip-count=10']));
  assert.equal(value.phase, 'L5');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.mode, 'plan');
  assert.equal(value.requestedTripCount, 10);
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.materializesTrips, false);
  assert.equal(value.changesCanonicalSource, false);
  assert.equal(value.enablesStorageV4Write, false);
});

test('L5 mantiene v3 canónico y digest obligatorio', () => {
  const value = json(run(['--trip-count=1']));
  assert.equal(value.perTripSafetyContract.canonicalSourceDuringPhase, 'v3');
  assert.equal(value.perTripSafetyContract.preflightRequired, true);
  assert.equal(value.perTripSafetyContract.expectedDigestRequiredBeforeApply, true);
  assert.equal(value.perTripSafetyContract.idempotentReplayRequired, true);
  assert.equal(value.perTripSafetyContract.publicTripRestoreApiAllowed, false);
  assert.equal(value.perTripSafetyContract.userDeleteSemanticsChanged, false);
});

test('L5 rechaza apply y tamaños inválidos', () => {
  for (const count of ['0', '-1', '1001', '1.5', 'abc']) {
    const result = run([`--trip-count=${count}`]);
    assert.notEqual(result.status, 0);
  }

  const apply = run(['--trip-count=1', '--apply']);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /plan-only/);
});
