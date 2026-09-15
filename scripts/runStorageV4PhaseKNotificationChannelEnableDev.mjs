/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';

const PROJECT = 'atlasmap-dev';
const USER_LABELS = Object.freeze({
  system: 'atlas-storage-v4',
  environment: 'dev',
  phase: 'k',
  purpose: 'alerts',
});
const EXPECTED_POLICY_IDS = Object.freeze([
  '16504134289496302618',
  '3373477211018044916',
  '9805388785302408646',
]);
const EXPECTED_POLICY_NAMES = Object.freeze(
  EXPECTED_POLICY_IDS.map((id) => `projects/${PROJECT}/alertPolicies/${id}`)
);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function gcloudCandidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const candidates = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.unshift(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
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
    fail(`gcloud fallo: ${detail || args.join(' ')}`);
  }
  return String(result.stdout || '').trim();
}

async function requestJson(url, { token, method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const error = new Error(`Monitoring API HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function listChannels(token) {
  const channels = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${PROJECT}/notificationChannels?${params}`,
      { token }
    );
    channels.push(...(Array.isArray(response?.notificationChannels) ? response.notificationChannels : []));
    pageToken = typeof response?.nextPageToken === 'string' ? response.nextPageToken : '';
  } while (pageToken);
  return channels;
}

async function listPolicies(token) {
  const policies = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${PROJECT}/alertPolicies?${params}`,
      { token }
    );
    policies.push(...(Array.isArray(response?.alertPolicies) ? response.alertPolicies : []));
    pageToken = typeof response?.nextPageToken === 'string' ? response.nextPageToken : '';
  } while (pageToken);
  return policies;
}

function isManagedAtlasEmailChannel(channel) {
  const labels = channel?.userLabels || {};
  return (
    channel?.type === 'email' &&
    labels.system === USER_LABELS.system &&
    labels.environment === USER_LABELS.environment &&
    labels.phase === USER_LABELS.phase &&
    labels.purpose === USER_LABELS.purpose
  );
}

function isAtlasPhaseKPolicy(policy) {
  const labels = policy?.userLabels || {};
  return (
    labels.system === USER_LABELS.system &&
    labels.environment === USER_LABELS.environment &&
    labels.phase === USER_LABELS.phase
  );
}

function normalizeChannels(policy) {
  return Array.isArray(policy?.notificationChannels)
    ? policy.notificationChannels.filter((value) => typeof value === 'string' && value.trim())
    : [];
}

function safeChannelSummary(channel) {
  return {
    name: typeof channel?.name === 'string' ? channel.name : null,
    displayName: typeof channel?.displayName === 'string' ? channel.displayName : null,
    type: typeof channel?.type === 'string' ? channel.type : null,
    enabled: channel?.enabled === true,
    verificationStatus:
      typeof channel?.verificationStatus === 'string' ? channel.verificationStatus : null,
  };
}

const apply = process.argv.slice(2).includes('--apply');
const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud en PATH o en Google Cloud SDK.');

const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

let channels;
let policies;
try {
  channels = (await listChannels(token)).filter(isManagedAtlasEmailChannel);
  policies = (await listPolicies(token)).filter(isAtlasPhaseKPolicy);
} catch (error) {
  fail(`No se pudo inventariar observabilidad antes de habilitar el canal: ${error.message}`);
}

if (channels.length !== 1) {
  fail('Se exige exactamente un email notification channel Atlas Phase K antes de habilitarlo.');
}

const channel = channels[0];
if (channel?.verificationStatus === 'UNVERIFIED') {
  fail('El notification channel Atlas esta UNVERIFIED; no se habilita.');
}

if (policies.length !== EXPECTED_POLICY_NAMES.length) {
  fail('No se encontraron exactamente las tres alert policies Atlas Phase K esperadas.');
}

const policyNames = policies.map((policy) => policy?.name).sort();
const expectedNames = [...EXPECTED_POLICY_NAMES].sort();
if (JSON.stringify(policyNames) !== JSON.stringify(expectedNames)) {
  fail('Las alert policies encontradas no coinciden exactamente con el conjunto esperado.');
}

if (policies.some((policy) => policy?.enabled === true)) {
  fail('Todas las alert policies deben permanecer deshabilitadas antes de habilitar el canal.');
}

if (
  policies.some((policy) => {
    const policyChannels = normalizeChannels(policy);
    return policyChannels.length !== 1 || policyChannels[0] !== channel.name;
  })
) {
  fail('Las tres alert policies deben estar asociadas exclusivamente al notification channel Atlas esperado.');
}

const plan = {
  project: PROJECT,
  applyRequested: apply,
  transport: 'monitoring-rest-v3',
  alertPolicyCount: policies.length,
  allAlertPoliciesDisabled: true,
  allAlertPoliciesAssociatedExclusively: true,
  notificationChannel: safeChannelSummary(channel),
  enableNeeded: channel?.enabled !== true,
  patchesOnlyNotificationChannelEnabled: true,
  changesAlertPolicies: false,
  enablesAlertPolicies: false,
  mutatesBudgets: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log('Dry-run: no se modifico el notification channel.');
  process.exit(0);
}

if (channel?.enabled === true) {
  console.log('Notification channel: ya esta habilitado; no se modifico.');
  process.exit(0);
}

let updated;
try {
  const params = new URLSearchParams({ updateMask: 'enabled' });
  updated = await requestJson(
    `https://monitoring.googleapis.com/v3/${channel.name}?${params}`,
    { token, method: 'PATCH', body: { enabled: true } }
  );
} catch (error) {
  fail(`No se pudo habilitar el notification channel: ${error.message}`);
}

if (
  !updated ||
  updated.name !== channel.name ||
  updated.type !== 'email' ||
  updated.enabled !== true ||
  updated.verificationStatus === 'UNVERIFIED' ||
  !isManagedAtlasEmailChannel(updated)
) {
  fail('La respuesta del PATCH no cumple el contrato seguro esperado.');
}

let postChannels;
let postPolicies;
try {
  postChannels = (await listChannels(token)).filter(isManagedAtlasEmailChannel);
  postPolicies = (await listPolicies(token)).filter(isAtlasPhaseKPolicy);
} catch (error) {
  fail(`El canal fue actualizado pero fallo el post-check: ${error.message}`);
}

if (
  postChannels.length !== 1 ||
  postChannels[0]?.name !== channel.name ||
  postChannels[0]?.enabled !== true ||
  postChannels[0]?.verificationStatus === 'UNVERIFIED'
) {
  fail('Post-check invalido: el notification channel no quedo habilitado como se esperaba.');
}

if (
  postPolicies.length !== EXPECTED_POLICY_NAMES.length ||
  postPolicies.some((policy) => policy?.enabled === true) ||
  postPolicies.some((policy) => {
    const policyChannels = normalizeChannels(policy);
    return policyChannels.length !== 1 || policyChannels[0] !== channel.name;
  })
) {
  fail('Post-check invalido: alguna alert policy cambio de estado o asociacion.');
}

console.log(
  JSON.stringify(
    {
      project: PROJECT,
      applied: true,
      transport: 'monitoring-rest-v3',
      notificationChannel: safeChannelSummary(postChannels[0]),
      alertPolicyCount: postPolicies.length,
      alertPoliciesRemainDisabled: true,
      alertPolicyAssociationsUnchanged: true,
      patchedFields: ['enabled'],
      budgetsUntouched: true,
      storageV4WriteUnchanged: true,
      productionUntouched: true,
    },
    null,
    2
  )
);
