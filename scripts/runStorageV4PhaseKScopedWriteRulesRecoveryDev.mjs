/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = 'atlasmap-dev';
const RELEASE_NAME = `projects/${PROJECT}/releases/cloud.firestore`;
const API_ROOT = 'https://firebaserules.googleapis.com/v1';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const cliArgs = process.argv.slice(2);
const apply = cliArgs.includes('--apply');

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function argValue(name) {
  const prefix = `${name}=`;
  const entry = cliArgs.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : '';
}

function rulesetId(value) {
  const name = String(value || '');
  const prefix = `projects/${PROJECT}/rulesets/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : '';
}

function validRulesetName(value) {
  return Boolean(rulesetId(value));
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
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
  if (files.length < 1) fail('El ruleset no expone source.files.');
  return files
    .map((file) => ({
      name: typeof file?.name === 'string' ? file.name : '',
      content: typeof file?.content === 'string' ? file.content : '',
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, content }) => `${name}\n${content}`)
    .join('\n---FILE---\n');
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
  fail(`La release no propago el ruleset esperado: ${targetRulesetName}.`);
}

async function deleteRulesetBestEffort(token, name) {
  const { status } = await request(`${API_ROOT}/${name}`, {
    token,
    method: 'DELETE',
    acceptedStatuses: [200, 204, 404],
  });
  return {
    deleted: status === 200 || status === 204,
    alreadyAbsent: status === 404,
  };
}

const originalRulesetName = argValue('--original-ruleset');
const temporaryRulesetName = argValue('--temporary-ruleset');
const originalSourceSha256 = argValue('--original-source-sha256').toLowerCase();
const temporarySourceSha256 = argValue('--temporary-source-sha256').toLowerCase();

if (!validRulesetName(originalRulesetName)) {
  fail('Falta --original-ruleset=<projects/atlasmap-dev/rulesets/...>.');
}
if (!validRulesetName(temporaryRulesetName)) {
  fail('Falta --temporary-ruleset=<projects/atlasmap-dev/rulesets/...>.');
}
if (originalRulesetName === temporaryRulesetName) {
  fail('original-ruleset y temporary-ruleset deben ser distintos.');
}
if (!validSha256(originalSourceSha256)) {
  fail('Falta --original-source-sha256=<64 hex>.');
}
if (!validSha256(temporarySourceSha256)) {
  fail('Falta --temporary-source-sha256=<64 hex>.');
}

const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud.');
const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

const release = await readRelease(token);
const currentRulesetName = String(release?.rulesetName || '');
if (!validRulesetName(currentRulesetName)) fail('cloud.firestore no apunta a un ruleset valido.');

const allowedCurrentRulesets = new Set([originalRulesetName, temporaryRulesetName]);
if (!allowedCurrentRulesets.has(currentRulesetName)) {
  fail(`Recovery abortado por drift: cloud.firestore apunta a un tercer ruleset ${currentRulesetName}.`);
}

const originalRuleset = await readRuleset(token, originalRulesetName);
const observedOriginalSha256 = sha256(canonicalRulesetSource(originalRuleset));
if (observedOriginalSha256 !== originalSourceSha256) {
  fail(`Recovery abortado: SHA original no coincide. Esperado ${originalSourceSha256}, observado ${observedOriginalSha256}.`);
}

let observedTemporarySha256 = null;
if (currentRulesetName === temporaryRulesetName) {
  const temporaryRuleset = await readRuleset(token, temporaryRulesetName);
  observedTemporarySha256 = sha256(canonicalRulesetSource(temporaryRuleset));
  if (observedTemporarySha256 !== temporarySourceSha256) {
    fail(`Recovery abortado: SHA temporal no coincide. Esperado ${temporarySourceSha256}, observado ${observedTemporarySha256}.`);
  }
}

console.log(JSON.stringify({
  project: PROJECT,
  mode: apply ? 'recovery-apply-plan' : 'recovery-preflight',
  releaseName: RELEASE_NAME,
  currentRulesetName,
  originalRulesetName,
  temporaryRulesetName,
  observedOriginalSha256,
  observedTemporarySha256,
  currentIsOriginal: currentRulesetName === originalRulesetName,
  currentIsTemporary: currentRulesetName === temporaryRulesetName,
  patchesOnlyReleaseRulesetName: apply && currentRulesetName === temporaryRulesetName,
  deletesOnlyKnownTemporaryRuleset: apply,
  mutatesApplicationData: false,
  enablesGlobalStorageV4Write: false,
  touchesProduction: false,
}, null, 2));

if (!apply) {
  console.log('Recovery preflight: no se modifico la release ni se elimino ningun ruleset.');
  process.exit(0);
}

if (currentRulesetName === temporaryRulesetName) {
  const patched = await patchRelease(token, originalRulesetName);
  if (patched?.rulesetName !== originalRulesetName) {
    fail('Recovery: la release no acepto el ruleset original.');
  }
  await waitForExecutable(token, originalRulesetName);
}

const restoredRelease = await readRelease(token);
if (restoredRelease?.rulesetName !== originalRulesetName) {
  fail('Recovery post-check fallo: cloud.firestore no apunta al ruleset original.');
}
const restoredRuleset = await readRuleset(token, originalRulesetName);
const restoredSourceSha256 = sha256(canonicalRulesetSource(restoredRuleset));
if (restoredSourceSha256 !== originalSourceSha256) {
  fail('Recovery post-check fallo: el source SHA original no coincide.');
}

const cleanup = await deleteRulesetBestEffort(token, temporaryRulesetName);

console.log(JSON.stringify({
  project: PROJECT,
  recoveredRollback: true,
  releaseName: RELEASE_NAME,
  restoredRulesetName: originalRulesetName,
  restoredSourceSha256,
  temporaryRulesetDeleted: cleanup.deleted,
  temporaryRulesetAlreadyAbsent: cleanup.alreadyAbsent,
  scopedWriteRulesActive: false,
  applicationDataUntouchedByRecovery: true,
  globalStorageV4WriteFlagChanged: false,
  productionUntouched: true,
}, null, 2));
