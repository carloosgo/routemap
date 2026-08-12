import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-budget-diagnose.ps1', import.meta.url);

test('budget diagnose queda bloqueado a atlasmap-dev y no muta recursos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('billingbudgets.googleapis.com/v1'));
  assert.ok(source.includes('-Method Get'));
  assert.ok(source.includes(':testIamPermissions'));
  assert.ok(source.includes('mutatesBudgets = $false'));
  assert.ok(source.includes('mutatesIam = $false'));
  assert.ok(source.includes('enablesApis = $false'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.equal(source.includes('setIamPolicy'), false);
  assert.equal(source.includes('billingbudgets.googleapis.com/v1/$BillingAccountName/budgets/'), false);
  assert.equal(source.includes('-Method Patch'), false);
  assert.equal(source.includes('-Method Delete'), false);
});

test('budget diagnose aplica quota project sin exponer billing account id', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("'x-goog-user-project' = $ProjectId"));
  assert.ok(source.includes('quotaProjectHeaderApplied = $true'));
  assert.ok(source.includes('quotaProject = $Project'));
  assert.ok(source.includes('serviceusage.services.use'));
  assert.ok(source.includes('exposesBillingAccountId = $false'));
});

test('budget diagnose separa API disabled, quota permission y budget read permission', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('gcloud services list'));
  assert.ok(source.includes('config.name:billingbudgets.googleapis.com'));
  assert.ok(source.includes('cloudresourcemanager.googleapis.com/v1/projects/${Project}:testIamPermissions'));
  assert.ok(source.includes('cloudbilling.googleapis.com/v1/${BillingAccountName}:testIamPermissions'));
  assert.ok(source.includes("'billing.budgets.list'"));
  assert.ok(source.includes("'billing.resourcebudgets.read'"));
  assert.ok(source.includes("'resourcemanager.projects.get'"));
  assert.ok(source.includes("'budget-api-disabled'"));
  assert.ok(source.includes("'quota-project-permission-blocked'"));
  assert.ok(source.includes("'budget-read-permission-blocked'"));
  assert.ok(source.includes('singleProjectBudgetReadPath'));
});

test('budget diagnose documenta rutas IAM minimas', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('roles/billing.viewer'));
  assert.ok(source.includes('roles/viewer'));
  assert.ok(source.includes('roles/billing.costsManager'));
  assert.ok(source.includes('roles/editor'));
  assert.ok(source.includes('billing.resourcebudgets.read'));
  assert.ok(source.includes('billing.resourcebudgets.write'));
});
