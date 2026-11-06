/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const preflightPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL2PreflightProd.mjs', import.meta.url));
const recoveryPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL2RecoveryProd.mjs', import.meta.url));
const budgetPath = fileURLToPath(new URL('../scripts/runStorageV4PhaseL2BudgetProd.mjs', import.meta.url));

function run(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true });
}

function jsonStdout(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('L2 preflight plan es read-only y target fijo prod', () => {
  const value = jsonStdout(run(preflightPath));
  assert.equal(value.phase, 'L2');
  assert.equal(value.mode, 'plan');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.location, 'us-central1');
  assert.equal(value.mutatesCloud, false);
  assert.equal(value.changesFirestore, false);
  assert.equal(value.changesBudgets, false);
  assert.equal(value.enablesStorageV4Read, false);
  assert.equal(value.enablesStorageV4Write, false);
});

test('L2 recovery exige retención explícita y token para apply', () => {
  const missing = run(recoveryPath);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /backup-retention/);

  const plan = jsonStdout(run(recoveryPath, ['--backup-retention=7d']));
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.requestedBackupRetention, '7d');
  assert.equal(plan.productionRecoveryMutation, false);
  assert.equal(plan.runsRestoreDrill, false);

  const badToken = run(recoveryPath, ['--backup-retention=7d', '--apply', '--confirm=OTHER']);
  assert.notEqual(badToken.status, 0);
  assert.match(badToken.stderr, /ENABLE-ATLAS-V4-PROD-L2-RECOVERY/);
});

test('L2 recovery no sobrescribe schedule y usa PITR + daily backups', () => {
  const source = readFileSync(recoveryPath, 'utf8');
  assert.match(source, /'--enable-pitr'/);
  assert.match(source, /'--recurrence=daily'/);
  assert.match(source, /no será sobrescrito automáticamente/);
  assert.match(source, /restoreDrillPendingFirstReadyBackup/);
  assert.doesNotMatch(source, /storage_v4_enabled/);
});

test('L2 budget no tiene monto ni thresholds default', () => {
  const missing = run(budgetPath);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--amount/);

  const missingThresholds = run(budgetPath, ['--amount=500']);
  assert.notEqual(missingThresholds.status, 0);
  assert.match(missingThresholds.stderr, /--thresholds/);

  const plan = jsonStdout(run(budgetPath, ['--amount=500', '--thresholds=0.5,0.8,1']));
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.project, 'atlasmap-prod');
  assert.equal(plan.budgetIsAlertOnlyNotHardCap, true);
  assert.equal(plan.mutatesOnlyBillingBudget, false);
  assert.deepEqual(plan.thresholds, [0.5, 0.8, 1]);
});

test('L2 budget apply está guardado y no imprime billing account', () => {
  const badToken = run(budgetPath, [
    '--amount=500',
    '--thresholds=0.5,0.8,1',
    '--apply',
    '--confirm=OTHER',
  ]);
  assert.notEqual(badToken.status, 0);
  assert.match(badToken.stderr, /CREATE-ATLAS-V4-PROD-L2-BUDGET/);

  const source = readFileSync(budgetPath, 'utf8');
  assert.match(source, /billingAccountIdExposed: false/);
  assert.match(source, /scope: `projects\/\$\{PROJECT\}`/);
  assert.match(source, /spendBasis: 'CURRENT_SPEND'/);
  assert.doesNotMatch(source, /atlasmap-dev/);
});
