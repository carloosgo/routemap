/* global fetch, process, console */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V4_EVENTARC_REGION,
  V4_EVENTARC_TRIGGERS,
  V4_SERVICE_REGION,
} from '../functions/v4BackendManifest.js';
import {
  buildV4DevStageVerification,
  DEV_STAGE_VERIFY_DATABASE,
  DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE,
  DEV_STAGE_VERIFY_EVENT_TYPE,
  DEV_STAGE_VERIFY_PRODUCTION_PROJECT,
  DEV_STAGE_VERIFY_PROJECT,
  getActiveFirestoreRuleset,
  listV4EventarcTriggers,
  listV4Functions,
  runStorageV4DevStageVerify,
} from './runStorageV4DevStageVerify.mjs';
import { resolveCliCommand, runCliProcess } from './crossPlatformCli.mjs';

export const DEV_RUNTIME_RECONCILE_PROJECT = DEV_STAGE_VERIFY_PROJECT;
export const DEV_RUNTIME_RECONCILE_PRODUCTION_PROJECT = DEV_STAGE_VERIFY_PRODUCTION_PROJECT;
export const DEV_RUNTIME_RECONCILE_CONFIRMATION = 'RECONCILE-ATLAS-V4-DEV-RUNTIME';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const rulesPath = join(repoRoot, 'firestore.rules');

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

export function parseDevRuntimeReconcileArgs(args = []) {
  for (const value of args) {
    if (value === '--apply' || value.startsWith('--confirm=')) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  if (args.filter((value) => value === '--apply').length > 1) {
    throw new TypeError('--apply no puede repetirse.');
  }
  const apply = args.includes('--apply');
  const confirmation = argumentValue(args, '--confirm');
  if (!apply && confirmation) throw new TypeError('--confirm solo se usa con --apply.');
  if (apply && confirmation !== DEV_RUNTIME_RECONCILE_CONFIRMATION) {
    throw new TypeError(
      `--apply exige --confirm=${DEV_RUNTIME_RECONCILE_CONFIRMATION}.`
    );
  }
  return Object.freeze({ apply, confirmation });
}

function accessTokenFromGcloud() {
  const gcloud = resolveCliCommand('gcloud');
  if (!gcloud) throw new Error('No se encontró gcloud disponible en PATH o Google Cloud SDK.');
  const result = runCliProcess(gcloud, ['auth', 'print-access-token']);
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`gcloud auth print-access-token falló con código ${result.status ?? 1}.`);
  }
  const token = String(result.stdout || '').trim();
  if (!token) throw new Error('gcloud no devolvió access token.');
  return token;
}

export async function inspectDevRuntime({
  token,
  fetchFn = fetch,
  candidateRules = readFileSync(rulesPath, 'utf8'),
} = {}) {
  const accessToken = token || accessTokenFromGcloud();
  const [cloudFunctions, eventarcTriggers, activeRules] = await Promise.all([
    listV4Functions({ token: accessToken, fetchFn }),
    listV4EventarcTriggers({ token: accessToken, fetchFn }),
    getActiveFirestoreRuleset({ token: accessToken, fetchFn }),
  ]);
  return buildV4DevStageVerification({
    candidateRules,
    cloudFunctions,
    eventarcTriggers,
    release: activeRules.release,
    ruleset: activeRules.ruleset,
  });
}

function uniqueServiceAccounts(verification) {
  return [...new Set((verification?.eventarc?.triggers || [])
    .filter((trigger) => trigger?.valid && typeof trigger?.serviceAccount === 'string')
    .map((trigger) => trigger.serviceAccount.trim())
    .filter(Boolean))];
}

export function buildDevRuntimeReconcilePlan(verification) {
  if (!verification || verification.project !== DEV_RUNTIME_RECONCILE_PROJECT) {
    throw new Error(`El inventario debe pertenecer exclusivamente a ${DEV_RUNTIME_RECONCILE_PROJECT}.`);
  }

  const blockers = [];
  if (!verification.functionsReady) {
    blockers.push('canonical-functions-not-ready');
  }
  const invalidTriggers = Array.isArray(verification?.eventarc?.invalidTriggers)
    ? verification.eventarc.invalidTriggers
    : [];
  if (invalidTriggers.length > 0) {
    blockers.push('existing-eventarc-trigger-invalid');
  }

  const missingTriggers = Array.isArray(verification?.eventarc?.missingTriggers)
    ? verification.eventarc.missingTriggers
    : [];
  const serviceAccounts = uniqueServiceAccounts(verification);
  if (missingTriggers.length > 0 && serviceAccounts.length !== 1) {
    blockers.push('eventarc-service-account-not-unambiguous');
  }
  if (missingTriggers.length > 0 && !verification?.eventarc?.destinationCloudRunService) {
    blockers.push('eventarc-destination-service-unavailable');
  }

  const knownTriggerNames = new Set(V4_EVENTARC_TRIGGERS.map((trigger) => trigger.name));
  if (missingTriggers.some((name) => !knownTriggerNames.has(name))) {
    blockers.push('unknown-missing-eventarc-trigger');
  }

  const actions = [];
  if (blockers.length === 0) {
    const serviceAccount = serviceAccounts[0] || null;
    for (const name of missingTriggers) {
      const expected = V4_EVENTARC_TRIGGERS.find((trigger) => trigger.name === name);
      actions.push(Object.freeze({
        type: 'create-eventarc-trigger',
        name: expected.name,
        kind: expected.kind,
        location: V4_EVENTARC_REGION,
        destinationService: verification.eventarc.destinationCloudRunService,
        destinationRegion: V4_SERVICE_REGION,
        eventType: DEV_STAGE_VERIFY_EVENT_TYPE,
        database: DEV_STAGE_VERIFY_DATABASE,
        document: expected.document,
        eventDataContentType: DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE,
        serviceAccount,
        project: DEV_RUNTIME_RECONCILE_PROJECT,
      }));
    }
    if (!verification?.rules?.matchesCandidate) {
      actions.push(Object.freeze({
        type: 'deploy-firestore-rules',
        project: DEV_RUNTIME_RECONCILE_PROJECT,
        expectedSha256: verification?.rules?.expectedSha256 || null,
        activeSha256: verification?.rules?.activeSha256 || null,
      }));
    }
  }

  return Object.freeze({
    project: DEV_RUNTIME_RECONCILE_PROJECT,
    productionProject: DEV_RUNTIME_RECONCILE_PRODUCTION_PROJECT,
    mode: 'v4-dev-runtime-reconcile',
    currentStaged: Boolean(verification.staged),
    functionsReady: Boolean(verification.functionsReady),
    missingEventarcTriggers: Object.freeze([...missingTriggers]),
    invalidEventarcTriggers: Object.freeze([...invalidTriggers]),
    rulesMatchCanonical: Boolean(verification?.rules?.matchesCandidate),
    blockers: Object.freeze(blockers),
    actions: Object.freeze(actions),
    canApply: blockers.length === 0,
    mutatesCloudWhenApplied: actions.length > 0,
    mutatesApplicationData: false,
    deploysFunctions: false,
    deploysHosting: false,
    mutatesIam: false,
    touchesProduction: false,
  });
}

export function eventarcCreateArgs(action) {
  if (action?.type !== 'create-eventarc-trigger') {
    throw new TypeError('La acción debe ser create-eventarc-trigger.');
  }
  if (action.project !== DEV_RUNTIME_RECONCILE_PROJECT) {
    throw new Error('El trigger solo puede crearse en atlasmap-dev.');
  }
  return Object.freeze([
    'eventarc', 'triggers', 'create', action.name,
    `--location=${action.location}`,
    `--destination-run-service=${action.destinationService}`,
    `--destination-run-region=${action.destinationRegion}`,
    `--event-filters=type=${action.eventType}`,
    `--event-filters=database=${action.database}`,
    `--event-filters-path-pattern=document=${action.document}`,
    `--event-data-content-type=${action.eventDataContentType}`,
    `--service-account=${action.serviceAccount}`,
    `--project=${DEV_RUNTIME_RECONCILE_PROJECT}`,
    '--quiet',
  ]);
}

function executeCli(executable, args, label) {
  const result = runCliProcess(executable, args);
  if (result.stdout) process.stdout.write(String(result.stdout));
  if (result.stderr) process.stderr.write(String(result.stderr));
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${label} terminó con código ${result.status ?? 1}.`);
  }
}

async function verifyAfterApply({ attempts = 13, intervalMs = 5000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runStorageV4DevStageVerify({ log: () => {} });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
      }
    }
  }
  throw lastError || new Error('La verificación posterior al apply no quedó staged.');
}

export async function runStorageV4DevRuntimeReconcile({
  args = process.argv.slice(2),
  inspect = inspectDevRuntime,
  verify = verifyAfterApply,
  log = (value) => console.log(value),
} = {}) {
  const options = parseDevRuntimeReconcileArgs(args);
  const verification = await inspect();
  const plan = buildDevRuntimeReconcilePlan(verification);
  log(JSON.stringify({ ...plan, applyRequested: options.apply }, null, 2));

  if (!plan.canApply) {
    throw new Error(`Reconciliación bloqueada: ${plan.blockers.join(', ')}.`);
  }
  if (!options.apply) {
    log(plan.actions.length
      ? `Dry-run: ${plan.actions.length} cambio(s) requerido(s); no se modificó cloud.`
      : 'Dry-run: atlasmap-dev ya coincide con el runtime v4 canónico; no hay cambios.');
    return plan;
  }
  if (plan.actions.length === 0) {
    log('atlasmap-dev ya coincide con el runtime v4 canónico; no se modificó cloud.');
    return plan;
  }

  const gcloud = plan.actions.some((action) => action.type === 'create-eventarc-trigger')
    ? resolveCliCommand('gcloud')
    : null;
  const firebase = plan.actions.some((action) => action.type === 'deploy-firestore-rules')
    ? resolveCliCommand('firebase')
    : null;
  if (plan.actions.some((action) => action.type === 'create-eventarc-trigger') && !gcloud) {
    throw new Error('No se encontró gcloud para crear el trigger Eventarc faltante.');
  }
  if (plan.actions.some((action) => action.type === 'deploy-firestore-rules') && !firebase) {
    throw new Error('No se encontró Firebase CLI para desplegar las Rules canónicas.');
  }

  for (const action of plan.actions) {
    if (action.type === 'create-eventarc-trigger') {
      executeCli(gcloud, eventarcCreateArgs(action), `Eventarc trigger ${action.name}`);
    } else if (action.type === 'deploy-firestore-rules') {
      executeCli(firebase, [
        'deploy',
        '--project', DEV_RUNTIME_RECONCILE_PROJECT,
        '--only', 'firestore:rules',
        '--non-interactive',
      ], 'Firebase Firestore Rules deploy');
    }
  }

  const finalVerification = await verify();
  const result = Object.freeze({
    project: DEV_RUNTIME_RECONCILE_PROJECT,
    reconciled: Boolean(finalVerification?.staged),
    appliedActions: Object.freeze(plan.actions.map((action) => action.type === 'create-eventarc-trigger'
      ? `${action.type}:${action.name}`
      : action.type)),
    functionsReady: Boolean(finalVerification?.functionsReady),
    eventarcReady: Boolean(finalVerification?.eventarc?.ready),
    rulesMatchCanonical: Boolean(finalVerification?.rules?.matchesCandidate),
    staged: Boolean(finalVerification?.staged),
    mutatesApplicationData: false,
    touchesProduction: false,
  });
  log(JSON.stringify(result, null, 2));
  if (!result.staged) throw new Error('La reconciliación terminó sin alcanzar staged=true.');
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevRuntimeReconcile().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
