import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-budget-diagnose.ps1', import.meta.url);

test('budget diagnose queda bloqueado a atlasmap-dev y no muta budgets', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('billingbudgets.googleapis.com/v1'));
  assert.ok(source.includes('-Method Get'));
  assert.ok(source.includes('mutatesBudgets = $false'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.equal(source.includes('-Method Post'), false);
  assert.equal(source.includes('-Method Patch'), false);
  assert.equal(source.includes('-Method Delete'), false);
});

test('budget diagnose no expone billing account id y documenta rutas IAM minimas', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('exposesBillingAccountId = $false'));
  assert.ok(source.includes('roles/billing.viewer'));
  assert.ok(source.includes('roles/viewer'));
  assert.ok(source.includes('roles/billing.costsManager'));
  assert.ok(source.includes('roles/editor'));
  assert.ok(source.includes('billing.resourcebudgets.read'));
  assert.ok(source.includes('billing.resourcebudgets.write'));
});
