/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'scripts', 'storage-v4-phase-k-preflight.ps1'), 'utf8');

test('Phase K recovery checkpoint reports project-scoped budgetCount', () => {
  assert.match(source, /billingbudgets\.googleapis\.com\/v1\/\$BillingAccountName\/budgets\?scope=\$scope/);
  assert.match(source, /budgetCountScope = 'project'/);
  assert.match(source, /\$budgetCount = @\(\$projectBudgetProbe\.budgets\)\.Count/);
});

test('Phase K recovery checkpoint keeps account-level count separate', () => {
  assert.match(source, /accountBudgetProbeStatus/);
  assert.match(source, /accountBudgetCount/);
  assert.doesNotMatch(source, /\$budgetCount = @\(\$accountBudgets\)\.Count/);
});
