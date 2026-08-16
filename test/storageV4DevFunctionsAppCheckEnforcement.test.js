import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CALLABLE_FUNCTION_NAMES } from '../functions/callableManifest.js';
import {
  DEV_FUNCTIONS_APP_CHECK_DEPLOY_BATCH_SIZE,
  DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_CONFIRMATION,
  DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT,
  DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT,
  DEV_FUNCTIONS_APP_CHECK_PARAM,
  DEV_FUNCTIONS_APP_CHECK_ROLLBACK_CONFIRMATION,
  buildCallableDeployBatches,
  buildFunctionsAppCheckDeployEnv,
  parseDevFunctionsAppCheckEnforcementArgs,
  withAppCheckParam,
} from '../scripts/runStorageV4DevFunctionsAppCheckEnforcement.mjs';

const source = readFileSync(resolve('scripts/runStorageV4DevFunctionsAppCheckEnforcement.mjs'), 'utf8');

test('runner queda hard-bound a dev y al parámetro central', () => {
  assert.equal(DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.equal(DEV_FUNCTIONS_APP_CHECK_PARAM, 'ENFORCE_APP_CHECK');
  assert.equal(DEV_FUNCTIONS_APP_CHECK_DEPLOY_BATCH_SIZE, 9);
});

test('enforcement exige confirmación exacta y acknowledgement de métricas', () => {
  assert.deepEqual(parseDevFunctionsAppCheckEnforcementArgs([]), {
    apply: false,
    rollback: false,
    metricsReviewed: false,
  });
  assert.throws(
    () => parseDevFunctionsAppCheckEnforcementArgs([
      '--apply',
      `--confirm=${DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_CONFIRMATION}`,
    ]),
    /ack-metrics-reviewed/
  );
  assert.deepEqual(
    parseDevFunctionsAppCheckEnforcementArgs([
      '--apply',
      '--ack-metrics-reviewed',
      `--confirm=${DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_CONFIRMATION}`,
    ]),
    { apply: true, rollback: false, metricsReviewed: true }
  );
});

test('rollback usa token distinto y no exige acknowledgement', () => {
  assert.deepEqual(
    parseDevFunctionsAppCheckEnforcementArgs([
      '--rollback',
      '--apply',
      `--confirm=${DEV_FUNCTIONS_APP_CHECK_ROLLBACK_CONFIRMATION}`,
    ]),
    { apply: true, rollback: true, metricsReviewed: false }
  );
  assert.throws(
    () => parseDevFunctionsAppCheckEnforcementArgs([
      '--rollback',
      '--apply',
      '--ack-metrics-reviewed',
      `--confirm=${DEV_FUNCTIONS_APP_CHECK_ROLLBACK_CONFIRMATION}`,
    ]),
    /no aplica al rollback/
  );
});

test('18 callables se despliegan en lotes de máximo 10; default genera 2 lotes de 9', () => {
  const batches = buildCallableDeployBatches();
  assert.equal(CALLABLE_FUNCTION_NAMES.length, 18);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches.map((batch) => batch.length), [9, 9]);
  assert.ok(batches.every((batch) => batch.length <= 10));
  assert.throws(() => buildCallableDeployBatches(CALLABLE_FUNCTION_NAMES, 11), /entre 1 y 10/);
});

test('inyección dotenv reemplaza sólo ENFORCE_APP_CHECK y conserva otros valores', () => {
  const input = 'OTHER=value\r\nENFORCE_APP_CHECK=false\r\nTHIRD=3\r\n';
  const enforced = withAppCheckParam(input, true);
  assert.match(enforced, /^OTHER=value\n/m);
  assert.match(enforced, /^THIRD=3\n/m);
  assert.match(enforced, /^ENFORCE_APP_CHECK=true\n$/m);
  assert.equal((enforced.match(/ENFORCE_APP_CHECK=/g) || []).length, 1);

  const rolledBack = withAppCheckParam(enforced, false);
  assert.match(rolledBack, /^ENFORCE_APP_CHECK=false\n$/m);
  assert.equal((rolledBack.match(/ENFORCE_APP_CHECK=/g) || []).length, 1);
});

test('Firebase CLI recibe el mismo switch en process env para construir el manifest', () => {
  const base = { OTHER: 'value', ENFORCE_APP_CHECK: 'stale' };
  const enforced = buildFunctionsAppCheckDeployEnv(true, base);
  assert.deepEqual(enforced, { OTHER: 'value', ENFORCE_APP_CHECK: 'true' });
  assert.deepEqual(base, { OTHER: 'value', ENFORCE_APP_CHECK: 'stale' });

  const rolledBack = buildFunctionsAppCheckDeployEnv(false, base);
  assert.deepEqual(rolledBack, { OTHER: 'value', ENFORCE_APP_CHECK: 'false' });
  assert.match(source, /firebaseCliProcessEnvInjected: true/);
  assert.match(source, /env: deployProcessEnv/);
});

test('Node queda fuera del shell y gcloud.cmd no hereda cwd/env dinámicos', () => {
  const directNode = source.indexOf('if (executable === process.execPath)');
  const cmdFallback = source.indexOf("if (process.platform === 'win32' && executable === 'gcloud.cmd')");
  assert.ok(directNode >= 0, 'Falta la rama explícita para process.execPath.');
  assert.ok(cmdFallback > directNode, 'La rama Node directa debe evaluarse antes del fallback gcloud.cmd.');
  assert.match(source, /return spawnSync\(process\.execPath, args, directOptions\);/);
  assert.match(source, /return spawnSync\('cmd\.exe', \['\/d', '\/c', 'gcloud\.cmd', \.\.\.args\], \{/);
  assert.match(source, /stdio: 'pipe'/);
  assert.doesNotMatch(source, /executable\.toLowerCase\(\)\.endsWith\('\.cmd'\)/);
  assert.doesNotMatch(source, /spawnSync\('cmd\.exe',[\s\S]{0,220}(cwd:|env:|directOptions)/);
});

test('runner no crea/borra Functions, no incluye probe HTTP y restaura dotenv', () => {
  assert.match(source, /createsFunctions: false/);
  assert.match(source, /deletesFunctions: false/);
  assert.match(source, /deploysNonCallableProbe: false/);
  assert.match(source, /projectEnvFileWouldBeRestored: true/);
  assert.match(source, /finally \{/);
  assert.match(source, /writeFileSync\(envPath, originalEnv/);
  assert.match(source, /unlinkSync\(envPath\)/);
  assert.doesNotMatch(source, /storageV4ProviderOutageProbe/);
  assert.match(source, /touchesProduction: false/);
  assert.match(source, /productionMutated: false/);
});

test('runner exige que los 18 callables ya existan antes de aplicar', () => {
  assert.match(source, /missingCallables/);
  assert.match(source, /allTargetCallablesAlreadyDeployed/);
  assert.match(source, /createsFunctions: false/);
  assert.match(source, /--only/);
  assert.match(source, /functions:\$\{name\}/);
});

test('inventario de Functions usa la API v2 y la región explícita de la CLI actual', () => {
  assert.match(source, /'--v2'/);
  assert.doesNotMatch(source, /'--gen2'/);
  assert.match(source, /`--regions=\$\{CALLABLE_FUNCTIONS_REGION\}`/);
});