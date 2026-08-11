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
  assert.match(source, /firestore\.\$LocationId\.rep\.googleapis\.com/);
  assert.match(source, /databases\/\$DatabaseId\/backupSchedules/);
  assert.doesNotMatch(source, /Invoke-RestMethod -Method (Post|Put|Patch|Delete)/i);
  assert.doesNotMatch(source, /firestore['\", ]+databases['\", ]+update/i);
  assert.doesNotMatch(source, /backups['\", ]+schedules['\", ]+create/i);
  assert.doesNotMatch(source, /backups['\", ]+schedules['\", ]+delete/i);
  assert.doesNotMatch(source, /billing['\", ]+budgets['\", ]+create/i);
  assert.doesNotMatch(source, /billing['\", ]+budgets['\", ]+delete/i);
  assert.doesNotMatch(source, /databases['\", ]+delete/i);
});

test('Phase K preflight no bloquea el resto si backup schedules no responde', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /status = 'unavailable'/);
  assert.match(source, /backupScheduleProbeStatus/);
  assert.match(source, /backupScheduleHttpStatus/);
  assert.match(source, /backupScheduleCount = if \(\$backupScheduleProbeStatus -eq 'ok'\)/);
});

test('Phase K preflight mantiene separado el ID de base de la respuesta de gcloud', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /\[string\]\$DatabaseId = '\(default\)'/);
  assert.match(source, /\$databaseInfo = Invoke-GcloudJson/);
  assert.match(source, /"--database=\$DatabaseId"/);
  assert.match(source, /database = \$DatabaseId/);
  assert.match(source, /locationId = \$databaseInfo\.locationId/);
  // PowerShell trata $Database y $database como la misma variable; este patrón
  // habría permitido repetir la regresión que convirtió el ID en un objeto.
  assert.doesNotMatch(source, /^\s*\$database\s*=\s*Invoke-GcloudJson/im);
});

test('Phase K preflight no serializa identidad ni billing account', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /activeAccountPresent = \$true/);
  assert.match(source, /billingEnabled = \$billingEnabled/);
  assert.match(source, /budgetCount = \$budgetCount/);
  assert.doesNotMatch(source, /^\s*activeAccount\s*=\s*\$account/m);
  assert.doesNotMatch(source, /^\s*billingAccount(Name|Id)\s*=\s*\$billingAccount/m);
});
