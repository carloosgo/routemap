import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-preflight.ps1', import.meta.url);

test('Phase K preflight es estrictamente read-only', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /firestore', 'databases', 'describe'/);
  assert.match(source, /firestore', 'backups', 'schedules', 'list'/);
  assert.match(source, /billing', 'projects', 'describe'/);
  assert.match(source, /billing', 'budgets', 'list'/);
  assert.match(source, /Invoke-RestMethod -Method Get/);
  assert.match(source, /databases\/\$encodedDatabase\/backupSchedules/);
  assert.doesNotMatch(source, /Invoke-RestMethod -Method (Post|Put|Patch|Delete)/i);
  assert.doesNotMatch(source, /firestore['", ]+databases['", ]+update/i);
  assert.doesNotMatch(source, /backups['", ]+schedules['", ]+create/i);
  assert.doesNotMatch(source, /backups['", ]+schedules['", ]+delete/i);
  assert.doesNotMatch(source, /billing['", ]+budgets['", ]+create/i);
  assert.doesNotMatch(source, /billing['", ]+budgets['", ]+delete/i);
  assert.doesNotMatch(source, /databases['", ]+delete/i);
});

test('Phase K preflight no serializa identidad ni billing account', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /activeAccountPresent = \$true/);
  assert.match(source, /billingEnabled = \$billingEnabled/);
  assert.match(source, /budgetCount = \$budgetCount/);
  assert.doesNotMatch(source, /^\s*activeAccount\s*=\s*\$account/m);
  assert.doesNotMatch(source, /^\s*billingAccount(Name|Id)\s*=\s*\$billingAccount/m);
});
