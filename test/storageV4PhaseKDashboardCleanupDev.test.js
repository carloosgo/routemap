import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-dashboard-cleanup-dev.ps1', import.meta.url);

test('dashboard cleanup queda bloqueado a atlasmap-dev y es dry-run por defecto', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('[switch]$Apply'));
  assert.ok(source.includes('if (-not $Apply)'));
  assert.ok(source.includes('Dry-run: no se elimino ningun dashboard.'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.ok(source.includes('enablesStorageV4Write = $false'));
});

test('dashboard cleanup elimina solo un duplicado equivalente y preserva recursos vecinos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('$details.Count -ne 2'));
  assert.ok(source.includes('Normalize-DashboardForComparison'));
  assert.ok(source.includes("'monitoring', 'dashboards', 'describe'"));
  assert.ok(source.includes('gcloud monitoring dashboards delete $duplicateId'));
  assert.ok(source.includes('alertPoliciesUntouched = $true'));
  assert.ok(source.includes('logMetricsUntouched = $true'));
  assert.ok(source.includes('budgetsUntouched = $true'));
  assert.equal(source.includes('policies delete'), false);
  assert.equal(source.includes('logging metrics delete'), false);
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

test('dashboard cleanup no depende de un ID canonico hardcodeado', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("[string]$PreferredDashboardId = ''"));
  assert.ok(source.includes('$ids = @($details | ForEach-Object { DashboardId $_ } | Sort-Object)'));
  assert.ok(source.includes('$ids -contains $PreferredDashboardId'));
  assert.equal(source.includes('8d6a1c24-ea96-4bc3-848d-442a40b2adef'), false);
  assert.equal(source.includes('dashboard canonico con el ID esperado'), false);
});
