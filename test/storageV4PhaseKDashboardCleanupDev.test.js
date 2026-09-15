import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-dashboard-cleanup-dev.ps1', import.meta.url);
const launcherPath = new URL('../scripts/runStorageV4PhaseKDashboardCleanupDev.mjs', import.meta.url);

test('dashboard cleanup queda bloqueado a atlasmap-dev y es dry-run por defecto', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('[switch]$Apply'));
  assert.ok(source.includes('if (-not $Apply)'));
  assert.ok(source.includes('Dry-run: no se elimino ningun dashboard.'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.ok(source.includes('enablesStorageV4Write = $false'));
});

test('dashboard cleanup inventaria, compara y elimina por Monitoring REST v1', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('monitoring.googleapis.com/v1/projects/$Project/dashboards'));
  assert.ok(source.includes('Get-MonitoringDashboardDetail'));
  assert.ok(source.includes('Normalize-DashboardForComparison'));
  assert.ok(source.includes('Invoke-RestMethod -Method Delete'));
  assert.ok(source.includes("transport = 'monitoring-rest-v1'"));
  assert.ok(source.includes("'x-goog-user-project' = $Project"));
  assert.equal(source.includes("'monitoring', 'dashboards', 'describe'"), false);
  assert.equal(source.includes('gcloud monitoring dashboards delete'), false);
});

test('dashboard cleanup elimina solo un duplicado equivalente y preserva recursos vecinos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('$details.Count -ne 2'));
  assert.ok(source.includes('$normalized[0] -ne $normalized[1]'));
  assert.ok(source.includes('Remove-MonitoringDashboard -ResourceName $duplicateResourceName'));
  assert.ok(source.includes('alertPoliciesUntouched = $true'));
  assert.ok(source.includes('logMetricsUntouched = $true'));
  assert.ok(source.includes('budgetsUntouched = $true'));
  assert.equal(source.includes('policies delete'), false);
  assert.equal(source.includes('logging metrics delete'), false);
});

test('dashboard cleanup es idempotente cuando ya existe exactamente un dashboard Atlas', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('if ($details.Count -eq 1)'));
  assert.ok(source.includes('cleanupNeeded = $false'));
  assert.ok(source.includes('alreadyClean = $true'));
  assert.ok(source.includes('no hay duplicado que eliminar'));
  assert.ok(source.includes('deletesExactlyOneDashboard = [bool]($Apply -and $details.Count -eq 2)'));
});

test('dashboard cleanup exige que el ID preferido exista antes de borrar', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("[string]$PreferredDashboardId = ''"));
  assert.ok(source.includes('$ids -notcontains $PreferredDashboardId'));
  assert.ok(source.includes('no aparece entre los dos candidatos validados'));
  assert.ok(source.includes('$existingId -ne $PreferredDashboardId'));
  assert.equal(source.includes('8d6a1c24-ea96-4bc3-848d-442a40b2adef'), false);
});

test('dashboard cleanup detecta Atlas por labels o firma de contenido', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('function Is-AtlasDevDashboard'));
  assert.ok(source.includes("$Dashboard.labels.system -eq 'atlas-storage-v4'"));
  for (const marker of [
    'storage_v4_rollout_metric',
    'storage_v4_sync_metric',
    'storage_v4_provider_cache_metric',
    'storage_v4_provider_request_metric',
    'atlas_storage_v4_rollout_events',
    'atlas_storage_v4_sync_events',
  ]) {
    assert.ok(source.includes(marker));
  }
  assert.ok(source.includes("foreach ($property in @('name', 'etag', 'displayName', 'labels'))"));
});

test('dashboard cleanup launcher permite reenviar un ID preferido validado', async () => {
  const source = await readFile(launcherPath, 'utf8');

  assert.ok(source.includes("const preferredPrefix = '--preferred-dashboard-id='"));
  assert.ok(source.includes("args.push('-PreferredDashboardId', preferredDashboardId)"));
  assert.ok(source.includes('/^[A-Za-z0-9_-]+$/'));
  assert.ok(source.includes("if (cliArgs.includes('--apply')) args.push('-Apply')"));
});
