/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/buildStorageV4PhaseKBudgetPlan.mjs', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('budget plan exige monto explicito y nunca tiene default monetario', () => {
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Falta --amount/);
});

test('budget plan exige thresholds explicitos y nunca inventa porcentajes', () => {
  const result = run(['--amount=25.50']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Falta --thresholds/);
});

test('budget plan genera scope solo para atlasmap-dev sin mutar Cloud', () => {
  const result = run(['--amount=25.50', '--thresholds=0.5,0.8,1']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);

  assert.equal(plan.project, 'atlasmap-dev');
  assert.equal(plan.mutatesBudgets, false);
  assert.equal(plan.touchesProduction, false);
  assert.equal(plan.requiresExplicitAmount, true);
  assert.equal(plan.requiresExplicitThresholds, true);
  assert.equal(plan.currencyCodeOmittedIntentionally, true);
  assert.deepEqual(plan.budget.budgetFilter.projects, ['projects/atlasmap-dev']);
  assert.equal(plan.budget.budgetFilter.calendarPeriod, 'MONTH');
  assert.deepEqual(plan.budget.amount.specifiedAmount, { units: '25', nanos: 500000000 });
  assert.deepEqual(
    plan.budget.thresholdRules.map((rule) => rule.thresholdPercent),
    [0.5, 0.8, 1]
  );
});

test('budget plan valida thresholds, nombre y monto', () => {
  assert.notEqual(run(['--amount=0', '--thresholds=1']).status, 0);
  assert.notEqual(run(['--amount=-1', '--thresholds=1']).status, 0);
  assert.notEqual(run(['--amount=10', '--thresholds=0,1']).status, 0);
  assert.notEqual(run(['--amount=10', '--thresholds=2.1']).status, 0);
  assert.notEqual(run(['--amount=10', '--thresholds=0.5,0.5']).status, 0);
  assert.notEqual(run(['--amount=10', '--thresholds=1', `--display-name=${'x'.repeat(61)}`]).status, 0);

  const result = run([
    '--amount=10.000000001',
    '--thresholds=1,0.5,0.8',
    '--display-name=Atlas dev budget',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.budget.displayName, 'Atlas dev budget');
  assert.deepEqual(plan.budget.thresholdRules.map((rule) => rule.thresholdPercent), [0.5, 0.8, 1]);
});
