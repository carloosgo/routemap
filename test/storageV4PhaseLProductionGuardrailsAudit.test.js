import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const applyRunners = [
  'scripts/runStorageV4PhaseL0CreateProductionProject.mjs',
  'scripts/runStorageV4PhaseL1LockRulesProd.mjs',
  'scripts/runStorageV4PhaseL1CreateWebAppProd.mjs',
  'scripts/runStorageV4PhaseL1ConfigureGoogleAuthProd.mjs',
  'scripts/runStorageV4PhaseL2RecoveryProd.mjs',
  'scripts/runStorageV4PhaseL2BudgetProd.mjs',
];

const planOnlyRunners = [
  'scripts/runStorageV4PhaseL4ReadPlanProd.mjs',
  'scripts/runStorageV4PhaseL5MaterializationPlanProd.mjs',
  'scripts/runStorageV4PhaseL6WritePlanProd.mjs',
  'scripts/runStorageV4PhaseL7ConvergencePlanProd.mjs',
];

test('todos los runners productivos mutables conservan confirmación explícita', () => {
  for (const file of applyRunners) {
    const value = source(file);
    assert.match(value, /CONFIRMATION/, `${file} debe declarar token de confirmación`);
    assert.match(value, /--apply/, `${file} debe exigir camino apply explícito`);
    assert.match(value, /--confirm=/, `${file} debe validar --confirm`);
  }
});

test('L1-L7 productivo está fijado a atlasmap-prod', () => {
  for (const file of [...applyRunners.slice(1), ...planOnlyRunners]) {
    const value = source(file);
    assert.match(value, /atlasmap-prod/, `${file} debe fijar target productivo`);
    assert.doesNotMatch(value, /PROJECT\s*=\s*['"]atlasmap-dev['"]/, `${file} no puede apuntar a dev`);
  }
});

test('L4-L7 son plan-only y rechazan apply/confirm', () => {
  for (const file of planOnlyRunners) {
    const value = source(file);
    assert.match(value, /plan-only|plan/, `${file} debe declarar modo plan`);
    assert.match(value, /--apply/, `${file} debe reconocer y rechazar --apply`);
    assert.match(value, /--confirm=/, `${file} debe reconocer y rechazar --confirm`);
    assert.match(value, /mutatesCloud:\s*false/, `${file} debe declarar cero mutación cloud`);
  }
});

test('L4-L7 no incorporan defaults silenciosos para cohortes/muestras', () => {
  const l4 = source(planOnlyRunners[0]);
  const l5 = source(planOnlyRunners[1]);
  const l6 = source(planOnlyRunners[2]);
  const l7 = source(planOnlyRunners[3]);
  assert.match(l4, /no tiene porcentaje default|No existe porcentaje default/);
  assert.match(l5, /no tiene tamaño de muestra default|No existe.*default/);
  assert.match(l6, /no tiene porcentaje default|No existe porcentaje default/);
  assert.match(l7, /No existe porcentaje default/);
});

test('convergencia no relaja delete irreversible ni retira v3 antes de 100%', () => {
  const l7 = source(planOnlyRunners[3]);
  assert.match(l7, /deleteRemainsUserIrreversible:\s*true/);
  assert.match(l7, /allowsUserTripRestore:\s*false/);
  assert.match(l7, /canonicalPercent !== 100/);
});
