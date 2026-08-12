/* global process, console, fetch */
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { composePhaseKE2ERules } from './firestorePhaseKE2ERules.mjs';

const PROJECT = 'atlasmap-dev';
const RELEASE_NAME = `projects/${PROJECT}/releases/cloud.firestore`;
const API_ROOT = 'https://firebaserules.googleapis.com/v1';
const STATE_VERSION = 1;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const statePath = join(repoRoot, '.phase-k-e2e-rules-state.json');
const cliArgs = process.argv.slice(2);
const apply = cliArgs.includes('--apply');
const rollback = cliArgs.includes('--rollback');

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

if (apply && rollback) fail('Usa solo uno de --apply o --rollback.');

function argValue(name) {
  const prefix = `${name}=`;
  const entry = cliArgs.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : '';
}

function gcloudCandidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const candidates = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
  };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', executable, ...args], options);
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of gcloudCandidates()) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runGcloud(gcloud, args) {
  const result = runProcess(gcloud, args);
  if (result.error) fail(`No se pudo ejecutar gcloud: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    fail(`gcloud fallo al ejecutar "gcloud ${args.join(' ')}": ${detail || `exit ${result.status}`}`);
  }
  return String(result.stdout || '').trim();
}

async function request(url, {
  token,
  method = 'GET',
  body,
  acceptedStatuses = [200],
} = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': PROJECT,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    fail(`No se pudo contactar Firebase Rules API: ${error?.message || error}`);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }

  if (!acceptedStatuses.includes(response.status)) {
    const apiMessage = String(payload?.error?.message || payload?.raw || '').trim();
    fail(`Firebase Rules API HTTP ${response.status}: ${apiMessage || response.statusText}`);
  }
  return { status: response.status, payload };
}

async function requestJson(url, options = {}) {
  const { payload } = await request(url, options);
  return payload;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalRulesetSource(ruleset) {
  const files = Array.isArray(ruleset?.source?.files) ? ruleset.source.files : [];
  if (files.length < 1) fail('El ruleset activo no expone source.files.');
  return files
    .map((file) => ({
      name: typeof file?.name === 'string' ? file.name : '',
      content: typeof file?.content === 'string' ? file.content : '',
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, content }) => `${name}\n${content}`)
    .join('\n---FILE---\n');
}

function rulesetId(value) {
  const name = String(value || '');
  const prefix = `projects/${PROJECT}/rulesets/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : '';
}

function validRulesetName(value) {
  return Boolean(rulesetId(value));
}

function readState() {
  if (!existsSync(statePath)) return null;
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (
      state?.version !== STATE_VERSION
      || state?.project !== PROJECT
      || state?.releaseName !== RELEASE_NAME
      || !validRulesetName(state?.originalRulesetName)
      || !validRulesetName(state?.temporaryRulesetName)
    ) {
      fail('El state file Phase K existe pero no cumple el contrato esperado.');
    }
    return state;
  } catch (error) {
    fail(`No se pudo leer el state file Phase K: ${error?.message || error}`);
  }
}

function writeState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function sourceInputs() {
  const v3 = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8');
  const v4 = readFileSync(join(repoRoot, 'firestore-v4.rules'), 'utf8');
  const scoped = composePhaseKE2ERules(v3, v4);
  return {
    scoped,
    scopedSha256: sha256(scoped),
    scopedBytes: Buffer.byteLength(scoped, 'utf8'),
  };
}

async function readRelease(token) {
  return requestJson(`${API_ROOT}/${RELEASE_NAME}`, { token });
}

async function readRuleset(token, name) {
  if (!validRulesetName(name)) fail(`Ruleset name invalido: ${name || '(empty)'}.`);
  return requestJson(`${API_ROOT}/${name}`, { token });
}

async function patchRelease(token, targetRulesetName) {
  return requestJson(`${API_ROOT}/${RELEASE_NAME}`, {
    token,
    method: 'PATCH',
    body: {
      release: {
        name: RELEASE_NAME,
        rulesetName: targetRulesetName,
      },
      updateMask: 'rulesetName',
    },
  });
}

async function waitForExecutable(token, targetRulesetName) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const executable = await requestJson(`${API_ROOT}/${RELEASE_NAME}:getExecutable`, { token });
    if (executable?.rulesetName === targetRulesetName) return executable;
    await delay(3000);
  }
  fail(`La release no propago el ruleset esperado: ${targetRulesetName}. Ejecuta --rollback.`);
}

async function createScopedRuleset(token, scoped) {
  const created = await requestJson(`${API_ROOT}/projects/${PROJECT}/rulesets`, {
    token,
    method: 'POST',
    body: {
      source: {
        files: [
          {
            name: 'firestore-phase-k-e2e.rules',
            content: scoped,
          },
        ],
      },
    },
  });
  if (!validRulesetName(created?.name)) {
    fail('Firebase Rules API no devolvio un ruleset temporal valido.');
  }
  return created;
}

async function deleteRulesetBestEffort(token, name) {
  const { status, payload } = await request(`${API_ROOT}/${name}`, {
    token,
    method: 'DELETE',
    acceptedStatuses: [200, 204, 404],
  });
  return {
    deleted: status === 200 || status === 204,
    alreadyAbsent: status === 404,
    detail: payload?.error?.message || null,
  };
}

const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud en PATH o Google Cloud SDK.');
const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

const release = await readRelease(token);
const currentRulesetName = String(release?.rulesetName || '');
if (!validRulesetName(currentRulesetName)) fail('La release cloud.firestore no apunta a un ruleset valido.');
const currentRuleset = await readRuleset(token, currentRulesetName);
const currentSourceSha256 = sha256(canonicalRulesetSource(currentRuleset));
const { scoped, scopedSha256, scopedBytes } = sourceInputs();
const state = readState();

if (!apply && !rollback) {
  console.log(JSON.stringify({
    project: PROJECT,
    mode: 'preflight',
    releaseName: RELEASE_NAME,
    currentRulesetName,
    currentRulesetId: rulesetId(currentRulesetName),
    currentSourceSha256,
    scopedSourceSha256: scopedSha256,
    scopedSourceBytes: scopedBytes,
    scopedTripPrefix: 'phase-k-e2e-*',
    stateFilePresent: Boolean(state),
    statePhase: state?.phase || null,
    mutatesCloud: false,
    mutatesApplicationData: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  }, null, 2));
  console.log('Preflight: no se creo ruleset ni se modifico la release de Firestore.');
  process.exit(0);
}

if (apply) {
  const expectedCurrentRuleset = argValue('--expected-current-ruleset');
  if (!validRulesetName(expectedCurrentRuleset)) {
    fail('Falta --expected-current-ruleset=<projects/atlasmap-dev/rulesets/...> obtenido del preflight.');
  }
  if (state) {
    fail('Ya existe un state file Phase K. Ejecuta --rollback antes de iniciar otro scoped rules rollout.');
  }
  if (currentRulesetName !== expectedCurrentRuleset) {
    fail(`Drift detectado: Cloud apunta a ${currentRulesetName}, no al ruleset aprobado ${expectedCurrentRuleset}.`);
  }
  if (scopedBytes >= 256 * 1024) {
    fail(`El ruleset Phase K ocupa ${scopedBytes} bytes y excede el limite de seguridad local de 256 KiB.`);
  }

  console.log(JSON.stringify({
    project: PROJECT,
    mode: 'apply-plan',
    releaseName: RELEASE_NAME,
    expectedCurrentRuleset,
    currentSourceSha256,
    scopedSourceSha256: scopedSha256,
    scopedSourceBytes: scopedBytes,
    createsOneImmutableRuleset: true,
    patchesOnlyReleaseRulesetName: true,
    scopedTripPrefix: 'phase-k-e2e-*',
    mutatesApplicationData: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  }, null, 2));

  const created = await createScopedRuleset(token, scoped);
  const temporaryRulesetName = created.name;
  const nextState = {
    version: STATE_VERSION,
    project: PROJECT,
    releaseName: RELEASE_NAME,
    originalRulesetName: currentRulesetName,
    originalSourceSha256: currentSourceSha256,
    temporaryRulesetName,
    temporarySourceSha256: scopedSha256,
    phase: 'ruleset-created',
    createdAtUtc: new Date().toISOString(),
  };
  writeState(nextState);

  const patched = await patchRelease(token, temporaryRulesetName);
  if (patched?.rulesetName !== temporaryRulesetName) {
    fail('La release no acepto el ruleset temporal esperado. Ejecuta --rollback.');
  }
  nextState.phase = 'release-patched';
  writeState(nextState);

  await waitForExecutable(token, temporaryRulesetName);
  const verifiedRelease = await readRelease(token);
  if (verifiedRelease?.rulesetName !== temporaryRulesetName) {
    fail('Post-check: cloud.firestore ya no apunta al ruleset temporal. Ejecuta --rollback.');
  }
  nextState.phase = 'active';
  nextState.activatedAtUtc = new Date().toISOString();
  writeState(nextState);

  console.log(JSON.stringify({
    project: PROJECT,
    applied: true,
    scopedWriteRulesActive: true,
    releaseName: RELEASE_NAME,
    originalRulesetName: currentRulesetName,
    temporaryRulesetName,
    scopedTripPrefix: 'phase-k-e2e-*',
    rollbackStateRecorded: true,
    globalStorageV4WriteFlagChanged: false,
    applicationDataUntouched: true,
    productionUntouched: true,
  }, null, 2));
  process.exit(0);
}

if (!state) fail('No existe state file Phase K; no hay un rollout conocido para revertir.');
const allowedCurrentRulesets = new Set([
  state.originalRulesetName,
  state.temporaryRulesetName,
]);
if (!allowedCurrentRulesets.has(currentRulesetName)) {
  fail(`Rollback abortado por drift: cloud.firestore apunta a un tercer ruleset ${currentRulesetName}.`);
}

console.log(JSON.stringify({
  project: PROJECT,
  mode: 'rollback-plan',
  releaseName: RELEASE_NAME,
  currentRulesetName,
  originalRulesetName: state.originalRulesetName,
  temporaryRulesetName: state.temporaryRulesetName,
  patchesOnlyReleaseRulesetName: currentRulesetName !== state.originalRulesetName,
  mutatesApplicationData: false,
  enablesGlobalStorageV4Write: false,
  touchesProduction: false,
}, null, 2));

if (currentRulesetName !== state.originalRulesetName) {
  const patched = await patchRelease(token, state.originalRulesetName);
  if (patched?.rulesetName !== state.originalRulesetName) {
    fail('Rollback: la release no acepto el ruleset original.');
  }
  state.phase = 'rollback-release-patched';
  writeState(state);
  await waitForExecutable(token, state.originalRulesetName);
}

const restoredRelease = await readRelease(token);
if (restoredRelease?.rulesetName !== state.originalRulesetName) {
  fail('Rollback post-check fallo: cloud.firestore no apunta al ruleset original.');
}
const restoredRuleset = await readRuleset(token, state.originalRulesetName);
const restoredSourceSha256 = sha256(canonicalRulesetSource(restoredRuleset));
if (restoredSourceSha256 !== state.originalSourceSha256) {
  fail('Rollback post-check fallo: el source SHA del ruleset original no coincide con el capturado.');
}

const cleanup = await deleteRulesetBestEffort(token, state.temporaryRulesetName);
if (cleanup.deleted || cleanup.alreadyAbsent) {
  unlinkSync(statePath);
} else {
  state.phase = 'rolled-back-temp-ruleset-retained';
  state.rolledBackAtUtc = new Date().toISOString();
  writeState(state);
}

console.log(JSON.stringify({
  project: PROJECT,
  rolledBack: true,
  releaseName: RELEASE_NAME,
  restoredRulesetName: state.originalRulesetName,
  restoredSourceSha256,
  temporaryRulesetDeleted: cleanup.deleted,
  temporaryRulesetAlreadyAbsent: cleanup.alreadyAbsent,
  rollbackStateCleared: cleanup.deleted || cleanup.alreadyAbsent,
  scopedWriteRulesActive: false,
  applicationDataUntouchedByRollback: true,
  globalStorageV4WriteFlagChanged: false,
  productionUntouched: true,
}, null, 2));
