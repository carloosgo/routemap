/* global fetch, process, console */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';
import {
  accessTokenFromGcloud,
  getRemoteConfigTemplate,
  publishRemoteConfigTemplate,
  resolveGcloud,
  validateRemoteConfigTemplate,
} from './storageV4RemoteConfigRestDev.mjs';
import {
  buildStorageV4KillSwitchTemplate,
  buildStorageV4PilotActivationTemplate,
  buildStorageV4ReadinessTemplate,
  summarizeStorageV4RemoteConfig,
} from './storageV4PilotRemoteConfigModel.mjs';
import {
  buildPilotStageVerification,
  getActiveFirestoreRuleset,
  listPilotEventarcTriggers,
  listPilotFunctions,
} from './runStorageV4PilotStageVerifyDev.mjs';

export const PILOT_RC_PROJECT = 'atlasmap-dev';
export const PILOT_RC_CONFIRMATIONS = Object.freeze({
  readiness: 'MARK-ATLAS-V4-PILOT-READY-DEV',
  activate: 'ACTIVATE-ATLAS-V4-PILOT-DEV',
  kill: 'KILL-ATLAS-V4-PILOT-DEV',
});

const ACTIONS = new Set(['readiness', 'activate', 'kill']);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function parsePercent(value) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100) {
    throw new TypeError('--cohort-percent debe estar en (0, 100].');
  }
  return number;
}

export function parsePilotRemoteConfigArgs(args = []) {
  const allowedFlags = new Set(['--apply']);
  for (const value of args) {
    if (
      allowedFlags.has(value)
      || value.startsWith('--action=')
      || value.startsWith('--cohort-percent=')
      || value.startsWith('--confirm=')
    ) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  if (args.filter((value) => value === '--apply').length > 1) {
    throw new TypeError('--apply no puede repetirse.');
  }
  const action = argumentValue(args, '--action');
  if (!ACTIONS.has(action)) {
    throw new TypeError('--action debe ser readiness, activate o kill.');
  }
  const apply = args.includes('--apply');
  const cohortPercent = parsePercent(argumentValue(args, '--cohort-percent'));
  const confirmation = argumentValue(args, '--confirm');
  if (action === 'activate' && cohortPercent == null) {
    throw new TypeError('activate exige --cohort-percent=<porcentaje explícito>.');
  }
  if (action !== 'activate' && cohortPercent != null) {
    throw new TypeError('--cohort-percent solo se permite con activate.');
  }
  if (!apply && confirmation) throw new TypeError('--confirm solo se usa con --apply.');
  if (apply && confirmation !== PILOT_RC_CONFIRMATIONS[action]) {
    throw new TypeError(`--apply exige --confirm=${PILOT_RC_CONFIRMATIONS[action]}.`);
  }
  return Object.freeze({ action, apply, cohortPercent, confirmation });
}

function safeOff(summary) {
  return summary.enabled === 'false'
    && summary.killSwitch === 'true'
    && summary.mode === 'off'
    && summary.cohortPercent === '0';
}

function allReadinessTrue(summary) {
  return Object.values(summary.readiness || {}).length === 7
    && Object.values(summary.readiness).every((value) => value === 'true');
}

export function buildPilotRemoteConfigPlan({ action, cohortPercent, currentSummary } = {}) {
  if (!ACTIONS.has(action)) throw new TypeError('action inválida.');
  if (!currentSummary || typeof currentSummary !== 'object') {
    throw new TypeError('currentSummary es obligatorio.');
  }
  const currentSafeOff = safeOff(currentSummary);
  const currentReadinessComplete = allReadinessTrue(currentSummary);
  const requiresStageVerification = action === 'readiness' || action === 'activate';
  const canApplyFromConfigState = action === 'kill'
    || (action === 'readiness' && currentSafeOff)
    || (action === 'activate' && currentSafeOff && currentReadinessComplete);
  return Object.freeze({
    project: PILOT_RC_PROJECT,
    action,
    cohortPercent: action === 'activate' ? cohortPercent : null,
    currentSafeOff,
    currentReadinessComplete,
    requiresStageVerification,
    canApplyFromConfigState,
    applyRequiresExplicitConfirmation: true,
    mutatesRemoteConfigOnApply: true,
    deploysFunctions: false,
    deploysRules: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  });
}

function targetTemplate(template, options) {
  if (options.action === 'readiness') return buildStorageV4ReadinessTemplate(template);
  if (options.action === 'activate') {
    return buildStorageV4PilotActivationTemplate(template, {
      cohortPercent: options.cohortPercent,
    });
  }
  return buildStorageV4KillSwitchTemplate(template);
}

function targetMatches(action, summary, cohortPercent) {
  if (action === 'readiness') return safeOff(summary) && allReadinessTrue(summary);
  if (action === 'activate') {
    return summary.enabled === 'true'
      && summary.killSwitch === 'false'
      && summary.mode === 'pilot'
      && Number(summary.cohortPercent) === cohortPercent
      && allReadinessTrue(summary);
  }
  return safeOff(summary);
}

async function verifyStage({ token, fetchFn, candidateRules }) {
  const [cloudFunctions, eventarcTriggers, activeRules, remoteConfig] = await Promise.all([
    listPilotFunctions({ token, fetchFn }),
    listPilotEventarcTriggers({ token, fetchFn }),
    getActiveFirestoreRuleset({ token, fetchFn }),
    getRemoteConfigTemplate({ token, fetchFn }),
  ]);
  return buildPilotStageVerification({
    candidateRules,
    cloudFunctions,
    eventarcTriggers,
    release: activeRules.release,
    ruleset: activeRules.ruleset,
    remoteConfigSummary: summarizeStorageV4RemoteConfig(remoteConfig.template),
  });
}

export async function runPilotRemoteConfigDev({
  args = process.argv.slice(2),
  token,
  fetchFn = fetch,
  gcloud = resolveGcloud(),
  v3Rules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'),
  v4Rules = readFileSync(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
  log = (value) => console.log(value),
} = {}) {
  const options = parsePilotRemoteConfigArgs(args);
  const accessToken = token || accessTokenFromGcloud(gcloud);
  const current = await getRemoteConfigTemplate({ token: accessToken, fetchFn });
  const currentSummary = summarizeStorageV4RemoteConfig(current.template);
  const plan = buildPilotRemoteConfigPlan({
    action: options.action,
    cohortPercent: options.cohortPercent,
    currentSummary,
  });
  log(JSON.stringify({ ...plan, applyRequested: options.apply, current: currentSummary }, null, 2));

  if (!options.apply) {
    log('Dry-run: Remote Config no fue modificado.');
    return Object.freeze({ ...plan, applyRequested: false, current: currentSummary });
  }
  if (!plan.canApplyFromConfigState) {
    throw new Error('Apply bloqueado: el estado actual de Remote Config no cumple la precondición fail-closed.');
  }

  if (plan.requiresStageVerification) {
    const stage = await verifyStage({
      token: accessToken,
      fetchFn,
      candidateRules: composePilotWriteRules(v3Rules, v4Rules),
    });
    if (!stage.staged) {
      throw new Error('Apply bloqueado: Functions/Rules/Eventarc no coinciden con el stage v4 esperado o ya existe tráfico pilot.');
    }
  }

  const nextTemplate = targetTemplate(current.template, options);
  await validateRemoteConfigTemplate({
    token: accessToken,
    etag: current.etag,
    template: nextTemplate,
    fetchFn,
  });
  await publishRemoteConfigTemplate({
    token: accessToken,
    etag: current.etag,
    template: nextTemplate,
    fetchFn,
  });

  const post = await getRemoteConfigTemplate({ token: accessToken, fetchFn });
  const postSummary = summarizeStorageV4RemoteConfig(post.template);
  if (!targetMatches(options.action, postSummary, options.cohortPercent)) {
    throw new Error('Post-check de Remote Config no coincide con el estado solicitado.');
  }
  const result = Object.freeze({
    project: PILOT_RC_PROJECT,
    action: options.action,
    applied: true,
    cohortPercent: options.action === 'activate' ? options.cohortPercent : null,
    post: postSummary,
    deploysFunctions: false,
    deploysRules: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runPilotRemoteConfigDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
