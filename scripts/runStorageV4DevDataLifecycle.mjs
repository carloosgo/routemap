/* global process, console */
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEV_TTL_POLICIES } from './storageV4DevTtlManifest.mjs';

export const DEV_DATA_LIFECYCLE_PROJECT = 'atlasmap-dev';
export const DEV_DATA_LIFECYCLE_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_DATA_LIFECYCLE_DATABASE = '(default)';
export const DEV_DATA_LIFECYCLE_CONFIRMATION = 'ENABLE-ATLAS-DEV-DATA-LIFECYCLE';

const HEALTHY_TTL_STATES = new Set(['ACTIVE', 'CREATING']);

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevDataLifecycleArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let apply = false;
  let confirm = '';
  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (apply && confirm !== DEV_DATA_LIFECYCLE_CONFIRMATION) {
    fail(`--apply exige --confirm=${DEV_DATA_LIFECYCLE_CONFIRMATION}.`, 2);
  }
  return Object.freeze({ apply });
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const candidates = [`${name}.cmd`, `${name}.exe`, name];
  if (name === 'gcloud' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', hasPath ? basename(executable) : executable, ...args], {
      ...options,
      ...(hasPath ? { cwd: dirname(executable) } : {}),
    });
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of commandCandidates('gcloud')) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(gcloud, args, label) {
  const result = runProcess(gcloud, args);
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

function describeDatabase(gcloud) {
  return parseJson(runChecked(gcloud, [
    'firestore', 'databases', 'describe',
    `--database=${DEV_DATA_LIFECYCLE_DATABASE}`,
    `--project=${DEV_DATA_LIFECYCLE_PROJECT}`,
    '--format=json',
  ], 'No se pudo describir Firestore dev'), 'Firestore dev');
}

function listTtlPolicies(gcloud) {
  const raw = parseJson(runChecked(gcloud, [
    'firestore', 'fields', 'ttls', 'list',
    `--database=${DEV_DATA_LIFECYCLE_DATABASE}`,
    `--project=${DEV_DATA_LIFECYCLE_PROJECT}`,
    '--format=json',
  ], 'No se pudieron listar TTL policies dev'), 'TTL policies dev');
  return Array.isArray(raw) ? raw : [];
}

export function summarizeLifecycleTtlPolicies(rawPolicies = []) {
  return (Array.isArray(rawPolicies) ? rawPolicies : []).map((policy) => {
    const name = String(policy?.name || '');
    const match = name.match(/\/collectionGroups\/([^/]+)\/fields\/([^/]+)$/);
    return Object.freeze({
      collectionGroup: match?.[1] || null,
      field: match?.[2] || null,
      state: policy?.ttlConfig?.state || null,
    });
  }).filter((policy) => policy.collectionGroup && policy.field);
}

export function buildDevDataLifecyclePlan({ database = {}, ttlPolicies = [] } = {}) {
  const observed = Array.isArray(ttlPolicies) ? ttlPolicies : [];
  const expectedGroups = new Set(DEV_TTL_POLICIES.map(({ collectionGroup }) => collectionGroup));
  const relevantObserved = observed.filter((policy) => expectedGroups.has(policy.collectionGroup));
  const conflicts = [];
  const unhealthy = [];
  const ttlToEnable = [];
  const configuredOrPending = [];
  const active = [];

  for (const expected of DEV_TTL_POLICIES) {
    const sameGroup = relevantObserved.filter((policy) => policy.collectionGroup === expected.collectionGroup);
    const wrongField = sameGroup.filter((policy) => policy.field !== expected.field);
    if (wrongField.length > 0) {
      conflicts.push(Object.freeze({
        collectionGroup: expected.collectionGroup,
        expectedField: expected.field,
        observedFields: Object.freeze(wrongField.map(({ field }) => field)),
      }));
      continue;
    }

    const match = sameGroup.find((policy) => policy.field === expected.field);
    if (!match) {
      ttlToEnable.push(expected);
      continue;
    }
    if (!HEALTHY_TTL_STATES.has(match.state)) {
      unhealthy.push(Object.freeze({
        collectionGroup: expected.collectionGroup,
        field: expected.field,
        state: match.state,
      }));
      continue;
    }
    configuredOrPending.push(expected.collectionGroup);
    if (match.state === 'ACTIVE') active.push(expected.collectionGroup);
  }

  return Object.freeze({
    deleteProtectionAlreadyEnabled: database?.deleteProtectionState === 'DELETE_PROTECTION_ENABLED',
    expectedTtlCount: DEV_TTL_POLICIES.length,
    activeTtlCount: active.length,
    configuredOrPendingTtlCount: configuredOrPending.length,
    ttlToEnable: Object.freeze(ttlToEnable),
    conflicts: Object.freeze(conflicts),
    unhealthy: Object.freeze(unhealthy),
    canApply: conflicts.length === 0 && unhealthy.length === 0,
  });
}

function assertDevTarget(gcloud) {
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const configuredProject = runChecked(gcloud, ['config', 'get-value', 'project'], 'No se pudo leer el proyecto gcloud activo');
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_DATA_LIFECYCLE_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_DATA_LIFECYCLE_PROJECT}.`);
  }
}

function enableDeleteProtection(gcloud) {
  runChecked(gcloud, [
    'firestore', 'databases', 'update',
    `--database=${DEV_DATA_LIFECYCLE_DATABASE}`,
    `--project=${DEV_DATA_LIFECYCLE_PROJECT}`,
    '--delete-protection',
    '--quiet',
  ], 'No se pudo habilitar Delete Protection en dev');
}

function enableTtl(gcloud, policy) {
  runChecked(gcloud, [
    'firestore', 'fields', 'ttls', 'update', policy.field,
    `--collection-group=${policy.collectionGroup}`,
    `--database=${DEV_DATA_LIFECYCLE_DATABASE}`,
    `--project=${DEV_DATA_LIFECYCLE_PROJECT}`,
    '--enable-ttl',
    '--async',
    '--quiet',
  ], `No se pudo iniciar TTL para ${policy.collectionGroup}.${policy.field}`);
}

export async function runStorageV4DevDataLifecycle({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  const { apply } = parseDevDataLifecycleArgs(args);
  log(JSON.stringify({
    project: DEV_DATA_LIFECYCLE_PROJECT,
    database: DEV_DATA_LIFECYCLE_DATABASE,
    mode: apply ? 'apply' : 'dry-run',
    operation: 'development-firestore-data-lifecycle-parity',
    expectedTtlPolicies: DEV_TTL_POLICIES,
    enablesDeleteProtectionIfMissing: true,
    enablesTtlIfMissing: true,
    ttlField: 'expiresAt',
    ttlOperationsStartAsync: true,
    ttlActivationCanDeleteAlreadyExpiredDocuments: true,
    ttlDeletesArePerformedByFirestore: true,
    ttlDeleteOperationsAreBillable: true,
    dryRunDeletesDocuments: false,
    mutatesCloud: apply,
    mutatesApplicationDataDirectly: false,
    changesRules: false,
    deploysFunctions: false,
    changesRemoteConfig: false,
    changesAuth: false,
    touchesProduction: false,
    productionProject: DEV_DATA_LIFECYCLE_PRODUCTION_PROJECT,
    confirmationRequiredForApply: DEV_DATA_LIFECYCLE_CONFIRMATION,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  let database = describeDatabase(gcloud);
  let observedTtl = summarizeLifecycleTtlPolicies(listTtlPolicies(gcloud));
  let plan = buildDevDataLifecyclePlan({ database, ttlPolicies: observedTtl });

  log(JSON.stringify({
    stage: 'precheck',
    project: DEV_DATA_LIFECYCLE_PROJECT,
    deleteProtectionState: database?.deleteProtectionState || null,
    pointInTimeRecoveryEnablement: database?.pointInTimeRecoveryEnablement || null,
    ...plan,
  }, null, 2));

  if (!plan.canApply) fail('Lifecycle dev bloqueado: existe TTL conflictivo o en estado no saludable.');
  if (!apply) {
    log(JSON.stringify({
      pass: true,
      mode: 'dry-run',
      cloudChanged: false,
      deleteProtectionWouldChange: !plan.deleteProtectionAlreadyEnabled,
      ttlPoliciesWouldStart: plan.ttlToEnable.map(({ collectionGroup, field }) => ({ collectionGroup, field })),
      expiredDocumentsMayBeDeletedOnlyAfterTtlPoliciesBecomeActive: plan.ttlToEnable.length > 0,
      touchesProduction: false,
    }, null, 2));
    return plan;
  }

  if (!plan.deleteProtectionAlreadyEnabled) {
    enableDeleteProtection(gcloud);
    log(JSON.stringify({ stage: 'delete-protection-enabled', project: DEV_DATA_LIFECYCLE_PROJECT }, null, 2));
  }

  const startedTtl = [];
  for (const policy of plan.ttlToEnable) {
    enableTtl(gcloud, policy);
    startedTtl.push(policy.collectionGroup);
    log(JSON.stringify({
      stage: 'ttl-operation-started',
      collectionGroup: policy.collectionGroup,
      field: policy.field,
      asynchronous: true,
    }, null, 2));
  }

  database = describeDatabase(gcloud);
  if (database?.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') {
    fail('Post-check: Delete Protection no quedó habilitado en atlasmap-dev.');
  }
  observedTtl = summarizeLifecycleTtlPolicies(listTtlPolicies(gcloud));
  plan = buildDevDataLifecyclePlan({ database, ttlPolicies: observedTtl });
  if (!plan.canApply) fail('Post-check: apareció una configuración TTL conflictiva o no saludable.');

  log(JSON.stringify({
    project: DEV_DATA_LIFECYCLE_PROJECT,
    pass: true,
    deleteProtectionEnabled: true,
    ttlEnableOperationsStarted: startedTtl.length,
    ttlConfiguredOrPendingCountObserved: plan.configuredOrPendingTtlCount,
    ttlActiveCountObserved: plan.activeTtlCount,
    ttlExpectedCount: plan.expectedTtlCount,
    ttlActivationPending: plan.activeTtlCount < plan.expectedTtlCount,
    ttlPoliciesStillNotObserved: plan.ttlToEnable.map(({ collectionGroup }) => collectionGroup),
    directApplicationDataMutation: false,
    expiredDocumentDeletionDelegatedToFirestoreTtl: true,
    ttlDeleteOperationsAreBillable: true,
    productionMutated: false,
  }, null, 2));
  return plan;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevDataLifecycle().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
