import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const applyScriptPath = new URL('../scripts/storage-v4-phase-k-observability-apply-dev.ps1', import.meta.url);
const preflightScriptPath = new URL('../scripts/storage-v4-phase-k-observability-preflight.ps1', import.meta.url);

test('observability apply dev esta bloqueado a atlasmap-dev y requiere Apply', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('[switch]$Apply'));
  assert.ok(source.includes('if (-not $Apply)'));
  assert.ok(source.includes('applyRequested = [bool]$Apply'));
  assert.ok(source.includes('enablesStorageV4Write = $false'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.ok(source.includes('mutatesBudgets = $false'));
  assert.ok(source.includes('deletesResources = $false'));
});

test('observability apply valida dashboard y crea solo recursos faltantes', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.ok(source.includes("'logging', 'metrics', 'create'"));
  assert.ok(source.includes('Get-LogMetricNames'));
  assert.equal(source.includes('& gcloud logging metrics describe'), false);
  assert.ok(source.includes("'monitoring', 'dashboards', 'create'"));
  assert.ok(source.includes("'--validate-only'"));
  assert.ok(source.includes('$dashboardExists'));
  assert.ok(source.includes("'monitoring', 'policies', 'create'"));
  assert.ok(source.includes('$existingPolicies'));
  assert.ok(source.includes('alertPoliciesRemainDisabledByConfig = $true'));
});

test('observability apply identifica recursos por labels y metric type, no por displayName Unicode', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.ok(source.includes('function Test-AtlasDashboard'));
  assert.ok(source.includes("$Dashboard.labels.system -eq 'atlas-storage-v4'"));
  assert.ok(source.includes("$Dashboard.labels.environment -eq 'dev'"));
  assert.ok(source.includes('function Test-AtlasAlertPolicyMatch'));
  assert.ok(source.includes("$Policy.userLabels.phase -ne 'k'"));
  assert.ok(source.includes('$plan.metricType'));
  assert.equal(source.includes('[string]$_.displayName -eq $dashboardDisplayName'), false);
});

test('observability apply fuerza UTF-8 en configs para Windows PowerShell 5', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.ok(source.includes('-Raw -Encoding UTF8'));
  assert.ok(source.includes('$dashboardConfig = Get-Content $dashboardFile -Raw -Encoding UTF8'));
});

test('observability apply no borra recursos, no muta budgets y no toca produccion', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.equal(source.includes("'delete'"), false);
  assert.equal(source.includes('Remove-Item'), false);
  assert.doesNotMatch(source, /billing[\s'",]+budgets[\s'",]+(create|update|delete)/i);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
  assert.equal(source.includes('enablesStorageV4Write = $true'), false);
});

test('observability preflight permanece read-only y usa labels ASCII estables', async () => {
  const source = await readFile(preflightScriptPath, 'utf8');

  assert.ok(source.includes("'monitoring', 'dashboards', 'list'"));
  assert.ok(source.includes("'monitoring', 'policies', 'list'"));
  assert.ok(source.includes("'logging', 'metrics', 'list'"));
  assert.ok(source.includes("$_.labels.system -eq 'atlas-storage-v4'"));
  assert.ok(source.includes("$_.userLabels.phase -eq 'k'"));
  assert.equal(source.includes("'create'"), false);
  assert.equal(source.includes("'update'"), false);
  assert.equal(source.includes("'delete'"), false);
});
