import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const applyScriptPath = new URL('../scripts/storage-v4-phase-k-observability-apply-dev.ps1', import.meta.url);
const preflightScriptPath = new URL('../scripts/storage-v4-phase-k-observability-preflight.ps1', import.meta.url);

test('observability apply dev esta bloqueado a atlasmap-dev y requiere Apply', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.match(source, /\$Project -ne 'atlasmap-dev'/);
  assert.match(source, /\[switch\]\$Apply/);
  assert.match(source, /if \(-not \$Apply\)/);
  assert.match(source, /applyRequested = \[bool\]\$Apply/);
  assert.match(source, /enablesStorageV4Write = \$false/);
  assert.match(source, /touchesProduction = \$false/);
  assert.match(source, /mutatesBudgets = \$false/);
  assert.match(source, /deletesResources = \$false/);
});

test('observability apply valida dashboard y crea solo recursos faltantes', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.match(source, /'logging', 'metrics', 'create'/);
  assert.match(source, /Test-LogMetricExists/);
  assert.match(source, /'monitoring', 'dashboards', 'create'/);
  assert.match(source, /'--validate-only'/);
  assert.match(source, /\$dashboardExists/);
  assert.match(source, /'monitoring', 'policies', 'create'/);
  assert.match(source, /\$existingPolicies/);
  assert.match(source, /alertPoliciesRemainDisabledByConfig = \$true/);
});

test('observability apply no borra recursos, no muta budgets y no toca produccion', async () => {
  const source = await readFile(applyScriptPath, 'utf8');

  assert.doesNotMatch(source, /'delete'|\bRemove-Item\b/i);
  assert.doesNotMatch(source, /billing['", ]+budgets['", ]+(create|update|delete)/i);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
  assert.doesNotMatch(source, /storageV4Write[^\r\n]*=\s*\$true/i);
});

test('observability preflight permanece read-only', async () => {
  const source = await readFile(preflightScriptPath, 'utf8');

  assert.match(source, /'monitoring', 'dashboards', 'list'/);
  assert.match(source, /'monitoring', 'policies', 'list'/);
  assert.match(source, /'logging', 'metrics', 'list'/);
  assert.doesNotMatch(source, /'create'|'update'|'delete'/i);
});
