/* global fetch, process, console */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';
import {
  accessTokenFromGcloud,
  getRemoteConfigTemplate,
  resolveGcloud,
} from './storageV4RemoteConfigRestDev.mjs';
import { summarizeStorageV4RemoteConfig } from './storageV4PilotRemoteConfigModel.mjs';
import {
  getActiveFirestoreRuleset,
  PILOT_VERIFY_PROJECT,
  PILOT_VERIFY_RELEASE,
} from './runStorageV4PilotStageVerifyDev.mjs';

export const PILOT_STAGE_RECOVERY_CONFIRMATION = 'RECOVER-ATLAS-V4-PILOT-STAGE-DEV';
const API_ROOT = 'https://firebaserules.googleapis.com/v1';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rulesContent(ruleset) {
  const files = ruleset?.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.content !== 'string') {
    throw new Error('El Ruleset debe contener exactamente un archivo fuente verificable.');
  }
  return files[0].content;
}

function validRulesetName(value) {
  return typeof value === 'string'
    && value.startsWith(`projects/${PILOT_VERIFY_PROJECT}/rulesets/`)
    && value.length > `projects/${PILOT_VERIFY_PROJECT}/rulesets/`.length;
}

function validSha(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function safeOff(summary) {
  return summary.enabled === 'false'
    && summary.killSwitch === 'true'
    && summary.mode === 'off'
    && summary.cohortPercent === '0';
}

function argValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

export function parsePilotStageSafetyArgs(args = []) {
  const allowedFlags = new Set(['--recover', '--apply']);
  for (const value of args) {
    if (
      allowedFlags.has(value)
      || value.startsWith('--original-ruleset=')
      || value.startsWith('--original-source-sha256=')
      || value.startsWith('--candidate-source-sha256=')
      || value.startsWith('--confirm=')
    ) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  const recover = args.includes('--recover');
  const apply = args.includes('--apply');
  if (apply && !recover) throw new TypeError('--apply solo se permite junto con --recover.');

  const originalRulesetName = argValue(args, '--original-ruleset');
  const originalSourceSha256 = argValue(args, '--original-source-sha256').toLowerCase();
  const candidateSourceSha256 = argValue(args, '--candidate-source-sha256').toLowerCase();
  const confirmation = argValue(args, '--confirm');

  if (!recover && (originalRulesetName || originalSourceSha256 || candidateSourceSha256 || confirmation)) {
    throw new TypeError('Los argumentos de recovery solo se permiten con --recover.');
  }
  if (recover) {
    if (!validRulesetName(originalRulesetName)) {
      throw new TypeError('--recover exige --original-ruleset=<projects/atlasmap-dev/rulesets/...>.');
    }
    if (!validSha(originalSourceSha256)) {
      throw new TypeError('--recover exige --original-source-sha256=<64 hex>.');
    }
    if (!validSha(candidateSourceSha256)) {
      throw new TypeError('--recover exige --candidate-source-sha256=<64 hex>.');
    }
  }
  if (!apply && confirmation) throw new TypeError('--confirm solo se usa con --apply.');
  if (apply && confirmation !== PILOT_STAGE_RECOVERY_CONFIRMATION) {
    throw new TypeError(`--apply exige --confirm=${PILOT_STAGE_RECOVERY_CONFIRMATION}.`);
  }

  return Object.freeze({
    recover,
    apply,
    originalRulesetName,
    originalSourceSha256,
    candidateSourceSha256,
    confirmation,
  });
}

export function buildPilotStageSnapshot({ activeRuleset, candidateRules, remoteConfigSummary } = {}) {
  if (!activeRuleset || typeof candidateRules !== 'string' || !candidateRules.trim()) {
    throw new TypeError('activeRuleset y candidateRules son obligatorios.');
  }
  if (!safeOff(remoteConfigSummary || {})) {
    throw new Error('Snapshot bloqueado: Remote Config debe permanecer OFF con kill switch activo.');
  }
  if (!validRulesetName(activeRuleset.name)) {
    throw new Error('El Ruleset activo no pertenece a atlasmap-dev.');
  }
  return Object.freeze({
    project: PILOT_VERIFY_PROJECT,
    releaseName: PILOT_VERIFY_RELEASE,
    originalRulesetName: activeRuleset.name,
    originalSourceSha256: sha256(rulesContent(activeRuleset)),
    candidateSourceSha256: sha256(candidateRules),
    remoteConfigSafeOff: true,
    mutatesCloud: false,
    activatesClientPilotTraffic: false,
    touchesProduction: false,
  });
}

export function buildPilotStageRecoveryPlan({
  activeRuleset,
  originalRulesetName,
  originalSourceSha256,
  candidateSourceSha256,
  remoteConfigSummary,
} = {}) {
  if (!safeOff(remoteConfigSummary || {})) {
    throw new Error('Recovery bloqueado: Remote Config no está seguramente apagado. Ejecuta kill switch primero.');
  }
  if (!activeRuleset || !validRulesetName(activeRuleset.name)) {
    throw new Error('Recovery bloqueado: Ruleset activo inválido.');
  }
  const activeSourceSha256 = sha256(rulesContent(activeRuleset));
  const currentIsOriginal = activeRuleset.name === originalRulesetName
    && activeSourceSha256 === originalSourceSha256;
  const currentIsCandidate = activeSourceSha256 === candidateSourceSha256;
  if (!currentIsOriginal && !currentIsCandidate) {
    throw new Error('Recovery abortado por drift: el Ruleset activo no es el original ni el candidato aprobado.');
  }
  return Object.freeze({
    project: PILOT_VERIFY_PROJECT,
    releaseName: PILOT_VERIFY_RELEASE,
    currentRulesetName: activeRuleset.name,
    activeSourceSha256,
    originalRulesetName,
    originalSourceSha256,
    candidateSourceSha256,
    currentIsOriginal,
    currentIsCandidate,
    patchNeeded: currentIsCandidate && !currentIsOriginal,
    remoteConfigSafeOff: true,
    mutatesApplicationData: false,
    changesRemoteConfig: false,
    activatesClientPilotTraffic: false,
    touchesProduction: false,
  });
}

async function requestJson(url, {
  token,
  method = 'GET',
  body,
  fetchFn = fetch,
} = {}) {
  const response = await fetchFn(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PILOT_VERIFY_PROJECT,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) throw new Error(`Firebase Rules API HTTP ${response.status}.`);
  return payload;
}

async function readRulesetByName({ token, rulesetName, fetchFn }) {
  if (!validRulesetName(rulesetName)) throw new Error('Ruleset original inválido.');
  return requestJson(`${API_ROOT}/${rulesetName}`, { token, fetchFn });
}

async function patchRelease({ token, rulesetName, fetchFn }) {
  return requestJson(`${API_ROOT}/${PILOT_VERIFY_RELEASE}`, {
    token,
    method: 'PATCH',
    fetchFn,
    body: {
      release: {
        name: PILOT_VERIFY_RELEASE,
        rulesetName,
      },
      updateMask: 'rulesetName',
    },
  });
}

async function waitForExecutable({ token, rulesetName, fetchFn }) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const executable = await requestJson(`${API_ROOT}/${PILOT_VERIFY_RELEASE}:getExecutable`, {
      token,
      fetchFn,
    });
    if (executable?.rulesetName === rulesetName) return executable;
    await delay(3000);
  }
  throw new Error(`Recovery: la release no propagó ${rulesetName}.`);
}

export async function runPilotStageSafetyDev({
  args = process.argv.slice(2),
  token,
  fetchFn = fetch,
  gcloud = resolveGcloud(),
  v3Rules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'),
  v4Rules = readFileSync(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
  log = (value) => console.log(value),
} = {}) {
  const options = parsePilotStageSafetyArgs(args);
  const accessToken = token || accessTokenFromGcloud(gcloud);
  const [active, remoteConfig] = await Promise.all([
    getActiveFirestoreRuleset({ token: accessToken, fetchFn }),
    getRemoteConfigTemplate({ token: accessToken, fetchFn }),
  ]);
  const remoteConfigSummary = summarizeStorageV4RemoteConfig(remoteConfig.template);

  if (!options.recover) {
    const snapshot = buildPilotStageSnapshot({
      activeRuleset: active.ruleset,
      candidateRules: composePilotWriteRules(v3Rules, v4Rules),
      remoteConfigSummary,
    });
    log(JSON.stringify({ mode: 'snapshot', ...snapshot }, null, 2));
    return snapshot;
  }

  const originalRuleset = await readRulesetByName({
    token: accessToken,
    rulesetName: options.originalRulesetName,
    fetchFn,
  });
  const observedOriginalSourceSha256 = sha256(rulesContent(originalRuleset));
  if (observedOriginalSourceSha256 !== options.originalSourceSha256) {
    throw new Error('Recovery abortado: el SHA del Ruleset original no coincide con el snapshot aprobado.');
  }

  const plan = buildPilotStageRecoveryPlan({
    activeRuleset: active.ruleset,
    originalRulesetName: options.originalRulesetName,
    originalSourceSha256: options.originalSourceSha256,
    candidateSourceSha256: options.candidateSourceSha256,
    remoteConfigSummary,
  });
  log(JSON.stringify({
    mode: options.apply ? 'recovery-apply-plan' : 'recovery-preflight',
    ...plan,
    observedOriginalSourceSha256,
  }, null, 2));
  if (!options.apply) {
    log('Recovery preflight: no se modificó Firestore Rules.');
    return plan;
  }

  if (plan.patchNeeded) {
    const patched = await patchRelease({
      token: accessToken,
      rulesetName: options.originalRulesetName,
      fetchFn,
    });
    if (patched?.rulesetName !== options.originalRulesetName) {
      throw new Error('Recovery: la release no aceptó el Ruleset original.');
    }
    await waitForExecutable({
      token: accessToken,
      rulesetName: options.originalRulesetName,
      fetchFn,
    });
  }

  const restored = await getActiveFirestoreRuleset({ token: accessToken, fetchFn });
  const restoredSha256 = sha256(rulesContent(restored.ruleset));
  if (
    restored.ruleset.name !== options.originalRulesetName
    || restoredSha256 !== options.originalSourceSha256
  ) {
    throw new Error('Recovery post-check falló: Firestore Rules no volvió exactamente al Ruleset original.');
  }

  const result = Object.freeze({
    project: PILOT_VERIFY_PROJECT,
    recovered: true,
    restoredRulesetName: restored.ruleset.name,
    restoredSourceSha256: restoredSha256,
    candidateFunctionsLeftStaged: true,
    remoteConfigChanged: false,
    clientPilotTrafficActivated: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runPilotStageSafetyDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
