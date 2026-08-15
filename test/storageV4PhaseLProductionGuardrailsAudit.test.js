import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function pathFor(relativePath) {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

function source(relativePath) {
  return readFileSync(pathFor(relativePath), 'utf8');
}

function run(relativePath, args = []) {
  return spawnSync(process.execPath, [pathFor(relativePath), ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
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

const validPlanArgs = new Map([
  [planOnlyRunners[0], ['--cohort-percent=1']],
  [planOnlyRunners[1], ['--trip-count=1']],
  [planOnlyRunners[2], ['--cohort-percent=1']],
  [planOnlyRunners[3], ['--canonical-percent=100']],
]);

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

test('L4-L7 son plan-only y rechazan apply/confirm por comportamiento', () => {
  for (const file of planOnlyRunners) {
    const args = validPlanArgs.get(file);
    const plan = run(file, args);
    assert.equal(plan.status, 0, `${file} debe aceptar su plan válido: ${plan.stderr}`);
    assert.match(plan.stdout, /"mode":\s*"plan"/, `${file} debe declarar mode=plan`);
    assert.match(plan.stdout, /"mutatesCloud":\s*false/, `${file} debe declarar cero mutación cloud`);

    const apply = run(file, [...args, '--apply']);
    assert.notEqual(apply.status, 0, `${file} debe rechazar --apply`);
    assert.match(`${apply.stdout}\n${apply.stderr}`, /plan-only|nunca admite --apply|no admite --apply/i);

    const confirm = run(file, [...args, '--confirm=UNSAFE']);
    assert.notEqual(confirm.status, 0, `${file} debe rechazar --confirm`);
    assert.match(`${confirm.stdout}\n${confirm.stderr}`, /plan-only|nunca admite --apply\/--confirm|no admite --confirm/i);
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
