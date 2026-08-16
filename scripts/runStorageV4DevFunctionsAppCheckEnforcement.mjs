/* global process, console */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALLABLE_FUNCTION_NAMES,
  CALLABLE_FUNCTIONS_REGION,
} from '../functions/callableManifest.js';

export const DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT = 'atlasmap-dev';
export const DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_CONFIRMATION = 'ENFORCE-ATLAS-DEV-FUNCTIONS-APP-CHECK';
export const DEV_FUNCTIONS_APP_CHECK_ROLLBACK_CONFIRMATION = 'ROLLBACK-ATLAS-DEV-FUNCTIONS-APP-CHECK';
export const DEV_FUNCTIONS_APP_CHECK_PARAM = 'ENFORCE_APP_CHECK';
export const DEV_FUNCTIONS_APP_CHECK_DEPLOY_BATCH_SIZE = 9;

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevFunctionsAppCheckEnforcementArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let apply = false;
  let rollback = false;
  let metricsReviewed = false;
  let confirm = '';

  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg === '--rollback') rollback = true;
    else if (arg === '--ack-metrics-reviewed') metricsReviewed = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }

  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (!apply && metricsReviewed) fail('--ack-metrics-reviewed solo se admite junto con --apply.', 2);

  if (apply) {
    const expected = rollback
      ? DEV_FUNCTIONS_APP_CHECK_ROLLBACK_CONFIRMATION
      : DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_CONFIRMATION;
    if (confirm !== expected) fail(`--apply exige --confirm=${expected}.`, 2);
    if (!rollback && !metricsReviewed) {
      fail('Enforcement de Functions exige --ack-metrics-reviewed.', 2);
    }
    if (rollback && metricsReviewed) {
      fail('--ack-metrics-reviewed no aplica al rollback de Functions.', 2);
    }
  }

  return Object.freeze({ apply, rollback, metricsReviewed });
}

export function buildCallableDeployBatches(
  names = CALLABLE_FUNCTION_NAMES,
  batchSize = DEV_FUNCTIONS_APP_CHECK_DEPLOY_BATCH_SIZE
) {
  if (!Array.isArray(names) || names.length === 0) throw new TypeError('names debe ser un arreglo no vacío.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) {
    throw new RangeError('batchSize debe estar entre 1 y 10.');
  }
  const batches = [];
  for (let index = 0; index < names.length; index += batchSize) {
    batches.push(Object.freeze(names.slice(index, index + batchSize)));
  }
  return Object.freeze(batches);
}

export function withAppCheckParam(raw = '', enabled = false) {
  const normalized = String(raw)
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*${DEV_FUNCTIONS_APP_CHECK_PARAM}\\s*=`).test(line));
  while (normalized.length > 0 && normalized.at(-1) === '') normalized.pop();
  normalized.push(`${DEV_FUNCTIONS_APP_CHECK_PARAM}=${enabled ? 'true' : 'false'}`);
  return `${normalized.join('\n')}\n`;
}

export function buildFunctionsAppCheckDeployEnv(enabled = false, baseEnv = process.env) {
  return {
    ...baseEnv,
    [DEV_FUNCTIONS_APP_CHECK_PARAM]: enabled ? 'true' : 'false',
  };
}

function commandCandidates() {
  return process.platform === 'win32'
    ? ['gcloud.cmd', 'gcloud.exe', 'gcloud']
    : ['gcloud'];
}

function runProcess(executable, args, options = {}) {
  const base = {
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.inherit ? 'inherit' : 'pipe',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
  };
  if (executable === process.execPath) {
    return spawnSync(process.execPath, args, base);
  }
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync('cmd.exe', ['/d', '/c', executable, ...args], base);
  }
  return spawnSync(executable, args, base);
}

function resolveGcloud() {
  for (const candidate of commandCandidates()) {
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(executable, args, label, options = {}) {
  const result = runProcess(executable, args, options);
  if (result.error) fail(`${label}: ${result.error.message}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) fail(`${label}: ${stderr || stdout || `exit ${result.status}`}`);
  return stdout;
}

function parseJson(raw, label) {
  try { return JSON.parse(raw || '[]'); }
  catch { fail(`${label}: respuesta JSON inválida.`); }
}

function assertDevTarget(gcloud) {
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const configuredProject = runChecked(gcloud, ['config', 'get-value', 'project'], 'No se pudo leer el proyecto gcloud activo');
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT}.`);
  }
}

function deployedFunctionName(item) {
  const fullName = String(item?.name || '').trim();
  if (fullName.includes('/')) return fullName.split('/').at(-1);
  return fullName;
}

function listDeployedFunctions(gcloud) {
  const raw = runChecked(gcloud, [
    'functions', 'list',
    '--v2',
    `--regions=${CALLABLE_FUNCTIONS_REGION}`,
    '--project', DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT,
    '--format=json',
  ], 'No se pudo inventariar Cloud Functions gen2 dev');
  const items = parseJson(raw, 'Inventario Cloud Functions gen2');
  if (!Array.isArray(items)) fail('Inventario Cloud Functions no devolvió un arreglo.');
  return Object.freeze(items.map(deployedFunctionName).filter(Boolean));
}

export async function runStorageV4DevFunctionsAppCheckEnforcement({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  repoRoot = resolve(process.cwd()),
  log = (value) => console.log(value),
} = {}) {
  const { apply, rollback, metricsReviewed } = parseDevFunctionsAppCheckEnforcementArgs(args);
  const targetEnabled = !rollback;
  const operation = rollback ? 'rollback-functions-app-check' : 'enforce-functions-app-check';
  const functionsDir = join(repoRoot, 'functions');
  const envPath = join(functionsDir, `.env.${DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT}`);
  const firebaseCli = join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const batches = buildCallableDeployBatches();
  const deployProcessEnv = buildFunctionsAppCheckDeployEnv(targetEnabled);

  log(JSON.stringify({
    project: DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT,
    productionProject: DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT,
    mode: apply ? 'apply' : 'dry-run',
    operation,
    region: CALLABLE_FUNCTIONS_REGION,
    targetCallableCount: CALLABLE_FUNCTION_NAMES.length,
    deployBatchCount: batches.length,
    deployBatchSizeMax: Math.max(...batches.map((batch) => batch.length)),
    targetParam: DEV_FUNCTIONS_APP_CHECK_PARAM,
    targetParamValue: targetEnabled,
    firebaseCliProcessEnvInjected: true,
    metricsReviewAcknowledged: metricsReviewed,
    replayProtectionEnabled: false,
    createsFunctions: false,
    deletesFunctions: false,
    deploysNonCallableProbe: false,
    changesFirestoreRules: false,
    changesAuthProviders: false,
    touchesProduction: false,
    mutatesCloud: apply,
    confirmationRequiredForApply: rollback
      ? DEV_FUNCTIONS_APP_CHECK_ROLLBACK_CONFIRMATION
      : DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_CONFIRMATION,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const deployed = listDeployedFunctions(gcloud);
  const missingCallables = CALLABLE_FUNCTION_NAMES.filter((name) => !deployed.includes(name));
  const firebaseCliReady = existsSync(firebaseCli);
  const functionsDirReady = existsSync(functionsDir);
  const canApply = missingCallables.length === 0 && firebaseCliReady && functionsDirReady;

  log(JSON.stringify({
    stage: 'precheck',
    project: DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT,
    deployedGen2FunctionCountObserved: deployed.length,
    expectedCallableCount: CALLABLE_FUNCTION_NAMES.length,
    missingCallables,
    allTargetCallablesAlreadyDeployed: missingCallables.length === 0,
    localFirebaseCliReady: firebaseCliReady,
    functionsDirectoryReady: functionsDirReady,
    projectEnvFilePresent: existsSync(envPath),
    envFileContentsPrinted: false,
    deployProcessEnvValuePrinted: false,
    deployBatches: batches,
    canApply,
  }, null, 2));

  if (!canApply) {
    fail('Functions App Check deploy bloqueado: faltan callables ya desplegados o tooling local.');
  }

  if (!apply) {
    log(JSON.stringify({
      pass: true,
      mode: 'dry-run',
      cloudChanged: false,
      operation,
      parameterWouldBeInjectedTemporarily: true,
      firebaseCliProcessEnvWouldBeInjected: true,
      projectEnvFileWouldBeRestored: true,
      callableDeployBatchesWouldRun: batches.length,
      functionsWouldBeCreated: false,
      functionsWouldBeDeleted: false,
      productionMutated: false,
    }, null, 2));
    return;
  }

  const envExisted = existsSync(envPath);
  const originalEnv = envExisted ? readFileSync(envPath, 'utf8') : '';
  let completedBatches = 0;
  try {
    writeFileSync(envPath, withAppCheckParam(originalEnv, targetEnabled), 'utf8');
    for (const batch of batches) {
      const only = batch.map((name) => `functions:${name}`).join(',');
      runChecked(process.execPath, [
        firebaseCli,
        'deploy',
        '--only', only,
        '--project', DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT,
        '--non-interactive',
      ], `Deploy App Check Functions lote ${completedBatches + 1} falló`, {
        cwd: repoRoot,
        inherit: true,
        env: deployProcessEnv,
      });
      completedBatches += 1;
      log(JSON.stringify({
        stage: 'callable-deploy-batch-complete',
        batch: completedBatches,
        callableCount: batch.length,
        targetEnforceAppCheck: targetEnabled,
      }, null, 2));
    }
  } finally {
    if (envExisted) writeFileSync(envPath, originalEnv, 'utf8');
    else if (existsSync(envPath)) unlinkSync(envPath);
  }

  if (completedBatches !== batches.length) {
    fail(`Deploy incompleto: lotes completados=${completedBatches}/${batches.length}.`);
  }

  const deployedAfter = listDeployedFunctions(gcloud);
  const missingAfter = CALLABLE_FUNCTION_NAMES.filter((name) => !deployedAfter.includes(name));
  if (missingAfter.length > 0) {
    fail(`Post-check: faltan callables después del deploy: ${missingAfter.join(', ')}.`);
  }

  log(JSON.stringify({
    project: DEV_FUNCTIONS_APP_CHECK_ENFORCEMENT_PROJECT,
    pass: true,
    operation,
    targetEnforceAppCheck: targetEnabled,
    callableCountDeployed: CALLABLE_FUNCTION_NAMES.length,
    deployBatchesCompleted: completedBatches,
    firebaseCliProcessEnvInjected: true,
    projectEnvFileRestored: true,
    projectEnvFileContentsPrinted: false,
    replayProtectionEnabled: false,
    nonCallableProbeDeployed: false,
    functionsCreated: false,
    functionsDeleted: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevFunctionsAppCheckEnforcement().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
