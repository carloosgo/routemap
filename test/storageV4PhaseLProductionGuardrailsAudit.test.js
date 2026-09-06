import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function pathFor(relativePath) {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

function source(relativePath) {
  return readFileSync(pathFor(relativePath), 'utf8');
}

const l0BootstrapRunner = 'scripts/runStorageV4PhaseL0CreateProductionProject.mjs';

const fixedTargetApplyRunners = [
  'scripts/runStorageV4PhaseL1LockRulesProd.mjs',
  'scripts/runStorageV4PhaseL1CreateWebAppProd.mjs',
  'scripts/runStorageV4PhaseL1ConfigureGoogleAuthProd.mjs',
  'scripts/runStorageV4PhaseL2RecoveryProd.mjs',
  'scripts/runStorageV4PhaseL2BudgetProd.mjs',
];

const retiredTransitionRunners = [
  'scripts/runStorageV4DevBlockCloseout.mjs',
  'scripts/runStorageV4PhaseL4ReadPlanProd.mjs',
  'scripts/runStorageV4PhaseL5MaterializationPlanProd.mjs',
  'scripts/runStorageV4PhaseL6WritePlanProd.mjs',
  'scripts/runStorageV4PhaseL7ConvergencePlanProd.mjs',
];

const currentOperationalDocs = [
  'README.md',
  'ARCHITECTURE.md',
  'SECURITY.md',
  'PRODUCTION_CHECKLIST.md',
  'docs/FIREBASE_FOUNDATION.md',
  'docs/STORAGE_V4_DEV_STEADY_STATE.md',
  'docs/STORAGE_V4_DEV_PREPROD_PARITY.md',
  'docs/STORAGE_V4_OPERATIONS_RUNBOOK.md',
  'docs/STORAGE_V4_PRODUCTION_ROLLOUT.md',
  'docs/STORAGE_V4_IMPLEMENTATION_STATUS.md',
];

const forbiddenOperationalIdentifiers = [
  'storage_v4_enabled',
  'storage_v4_kill_switch',
  'storage_v4_mode',
  'storage_v4_cohort_percent',
  'runV4PilotAdvanceDev',
  'runStorageV4PilotKillDev',
];

test('bootstrap L0 exige target explícito, rechaza dev y conserva confirmación', () => {
  const value = source(l0BootstrapRunner);
  assert.match(value, /requiredText\(option\(args, '--project'\), '--project'\)/);
  assert.match(value, /DEV_PROJECT\s*=\s*['"]atlasmap-dev['"]/);
  assert.match(value, /project === DEV_PROJECT/);
  assert.match(value, /CREATE-ATLAS-V4-PROD-\$\{project\}/);
  assert.match(value, /--apply/);
  assert.match(value, /--confirm=/);
});

test('runners productivos posteriores conservan atlasmap-prod y confirmación explícita', () => {
  for (const file of fixedTargetApplyRunners) {
    const value = source(file);
    assert.match(value, /atlasmap-prod/, `${file} debe fijar target productivo`);
    assert.doesNotMatch(value, /PROJECT\s*=\s*['"]atlasmap-dev['"]/, `${file} no puede apuntar a dev`);
    assert.match(value, /--apply/, `${file} debe conservar camino apply explícito`);
    assert.match(value, /--confirm=/, `${file} debe validar confirmación explícita`);
  }
});

test('planners y closeout de transición ya no son superficie ejecutable', () => {
  for (const file of retiredTransitionRunners) {
    assert.equal(existsSync(pathFor(file)), false, `${file} debe permanecer retirado`);
  }

  const packageJson = JSON.parse(source('package.json'));
  const scripts = packageJson.scripts || {};
  assert.equal(scripts['storage-v4:dev:verify'], 'node scripts/runStorageV4DevStageVerify.mjs');
  assert.equal(scripts['storage-v4:dev-block-closeout'], undefined);
  assert.equal(scripts['phase-l:l4:read-plan-prod'], undefined);
  assert.equal(scripts['phase-l:l5:materialization-plan-prod'], undefined);
  assert.equal(scripts['phase-l:l6:write-plan-prod'], undefined);
  assert.equal(scripts['phase-l:l7:convergence-plan-prod'], undefined);
});

test('documentación operacional actual no vuelve a seleccionar generación de storage', () => {
  for (const file of currentOperationalDocs) {
    const value = source(file);
    for (const identifier of forbiddenOperationalIdentifiers) {
      assert.doesNotMatch(value, new RegExp(identifier), `${file} no debe reintroducir ${identifier}`);
    }
  }
});

test('runbooks vigentes declaran v4-only y producción directa v4', () => {
  assert.match(source('README.md'), /Storage v4-only/i);
  assert.match(source('ARCHITECTURE.md'), /Storage v4/i);
  assert.match(source('docs/FIREBASE_FOUNDATION.md'), /Storage v4-only/i);
  assert.match(source('docs/STORAGE_V4_DEV_STEADY_STATE.md'), /Storage v4-only/i);
  assert.match(source('docs/STORAGE_V4_DEV_PREPROD_PARITY.md'), /v4-only/i);
  assert.match(source('docs/STORAGE_V4_PRODUCTION_ROLLOUT.md'), /release directo.*v4/i);
  assert.match(source('docs/STORAGE_V4_IMPLEMENTATION_STATUS.md'), /Storage v4-only/i);
});

test('platform parity ya no depende de Remote Config para readiness de storage', () => {
  const value = source('scripts/runStorageV4DevPlatformParityPreflight.mjs');
  assert.doesNotMatch(value, /firebaseremoteconfig\.googleapis\.com/);
  assert.doesNotMatch(value, /remoteConfig\s*:/);
  assert.doesNotMatch(value, /Remote Config service readiness/);
});

test('producción sigue separada de dev en aliases Firebase', () => {
  const firebaseRc = JSON.parse(source('.firebaserc'));
  assert.equal(firebaseRc.projects.default, 'atlasmap-dev');
  assert.equal(firebaseRc.projects.dev, 'atlasmap-dev');
  assert.equal(firebaseRc.projects.prod, 'atlasmap-prod');
});
