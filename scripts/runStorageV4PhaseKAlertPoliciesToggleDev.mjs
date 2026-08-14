/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';

const PROJECT = 'atlasmap-dev';
const ENABLE_CONFIRM = 'ENABLE-ATLAS-V4-PHASE-K-ALERTS-DEV';
const DISABLE_CONFIRM = 'DISABLE-ATLAS-V4-PHASE-K-ALERTS-DEV';
const EXPECTED_POLICY_IDS = Object.freeze([
  '16504134289496302618',
  '3373477211018044916',
  '9805388785302408646',
]);
const EXPECTED_POLICY_NAMES = Object.freeze(
  EXPECTED_POLICY_IDS.map((id) => `projects/${PROJECT}/alertPolicies/${id}`)
);
const ATLAS_LABELS = Object.freeze({
  system: 'atlas-storage-v4',
  environment: 'dev',
  phase: 'k',
});
const CHANNEL_LABELS = Object.freeze({
  ...ATLAS_LABELS,
  purpose: 'alerts',
});

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function argValue(name) {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function parseArgs() {
  const action = argValue('--action') || 'status';
  if (!['status', 'enable', 'disable'].includes(action)) {
    fail('--action debe ser status, enable o disable.', 2);
  }
  const apply = process.argv.slice(2).includes('--apply');
  const confirm = argValue('--confirm');
  const known = process.argv.slice(2).filter((arg) =>
    arg === '--apply' || arg.startsWith('--action=') || arg.startsWith('--confirm=')
  );
  if (known.length !== process.argv.slice(2).length) {
    fail('Hay argumentos no reconocidos.', 2);
  }
  if (apply && action === 'status') fail('--apply no es válido con --action=status.', 2);
  if (apply && action === 'enable' && confirm !== ENABLE_CONFIRM) {
    fail(`Para habilitar se exige --confirm=${ENABLE_CONFIRM}.`, 2);
  }
  if (apply && action === 'disable' && confirm !== DISABLE_CONFIRM) {
    fail(`Para deshabilitar se exige --confirm=${DISABLE_CONFIRM}.`, 2);
  }
  return { action, apply };
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
    fail(`gcloud falló: ${detail || args.join(' ')}`);
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

async function listPages(token, resource, field) {
  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${PROJECT}/${resource}?${params}`,
      { token }
    );
    items.push(...(Array.isArray(response?.[field]) ? response[field] : []));
    pageToken = typeof response?.nextPageToken === 'string' ? response.nextPageToken : '';
  } while (pageToken);
  return items;
}

function hasLabels(resource, expected) {
  const labels = resource?.userLabels || {};
  return Object.entries(expected).every(([key, value]) => labels[key] === value);
}

function normalizeChannels(policy) {
  return Array.isArray(policy?.notificationChannels)
    ? policy.notificationChannels.filter((value) => typeof value === 'string' && value.trim())
    : [];
}

function policySummary(policy) {
  const condition = Array.isArray(policy?.conditions) ? policy.conditions[0] : null;
  const threshold = condition?.conditionThreshold;
  return {
    name: policy?.name || null,
    displayName: policy?.displayName || null,
    enabled: policy?.enabled === true,
    notificationChannels: normalizeChannels(policy),
    thresholdValue: Number.isFinite(threshold?.thresholdValue) ? threshold.thresholdValue : null,
    alignmentPeriod: threshold?.aggregations?.[0]?.alignmentPeriod || null,
  };
}

function validateInventory(policies, channels) {
  const atlasPolicies = policies.filter((policy) => hasLabels(policy, ATLAS_LABELS));
  const names = atlasPolicies.map((policy) => policy?.name).sort();
  if (
    atlasPolicies.length !== EXPECTED_POLICY_NAMES.length ||
    JSON.stringify(names) !== JSON.stringify([...EXPECTED_POLICY_NAMES].sort())
  ) {
    fail('El inventario de alert policies Atlas Phase K no coincide exactamente con las 3 esperadas.');
  }

  const managedChannels = channels.filter(
    (channel) => channel?.type === 'email' && hasLabels(channel, CHANNEL_LABELS)
  );
  if (managedChannels.length !== 1) {
    fail('Debe existir exactamente un notification channel email Atlas Phase K.');
  }
  const channel = managedChannels[0];
  if (channel?.enabled !== true) fail('El notification channel Atlas todavía no está habilitado.');
  if (channel?.verificationStatus === 'UNVERIFIED') fail('El notification channel Atlas está UNVERIFIED.');
  if (typeof channel?.name !== 'string' || !channel.name.startsWith(`projects/${PROJECT}/notificationChannels/`)) {
    fail('El notification channel Atlas no tiene un resource name válido.');
  }

  for (const policy of atlasPolicies) {
    const policyChannels = normalizeChannels(policy);
    if (policyChannels.length !== 1 || policyChannels[0] !== channel.name) {
      fail(`La policy ${policy.name} no está asociada exclusivamente al canal Atlas esperado.`);
    }
    if (!Array.isArray(policy?.conditions) || policy.conditions.length !== 1) {
      fail(`La policy ${policy.name} no tiene exactamente una condición.`);
    }
  }

  return { atlasPolicies, channel };
}

async function patchEnabled(token, policy, enabled) {
  const params = new URLSearchParams({ updateMask: 'enabled' });
  const updated = await requestJson(
    `https://monitoring.googleapis.com/v3/${policy.name}?${params}`,
    { token, method: 'PATCH', body: { enabled } }
  );
  if (!updated || updated.name !== policy.name || updated.enabled !== enabled) {
    fail(`La respuesta PATCH de ${policy.name} no dejó enabled=${enabled}.`);
  }
  return updated;
}

const { action, apply } = parseArgs();
const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontró una instalación utilizable de gcloud.');
const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

let policies;
let channels;
try {
  [policies, channels] = await Promise.all([
    listPages(token, 'alertPolicies', 'alertPolicies'),
    listPages(token, 'notificationChannels', 'notificationChannels'),
  ]);
} catch (error) {
  fail(`No se pudo inventariar Cloud Monitoring: ${error.message}`);
}

const initial = validateInventory(policies, channels);
const targetEnabled = action === 'enable' ? true : action === 'disable' ? false : null;
const summaries = initial.atlasPolicies.map(policySummary).sort((a, b) => a.name.localeCompare(b.name));

console.log(JSON.stringify({
  project: PROJECT,
  action,
  applyRequested: apply,
  alertPolicyCount: summaries.length,
  alertPolicies: summaries,
  notificationChannel: {
    name: initial.channel.name,
    displayName: initial.channel.displayName || null,
    enabled: initial.channel.enabled === true,
    verificationStatus: initial.channel.verificationStatus || null,
  },
  targetEnabled,
  patchesOnlyAlertPolicyEnabled: true,
  changesThresholds: false,
  changesNotificationChannels: false,
  mutatesBudgets: false,
  mutatesApplicationData: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
}, null, 2));

if (action === 'status' || !apply) {
  console.log(action === 'status' ? 'Status read-only completado.' : 'Dry-run: no se modificó ninguna policy.');
  process.exit(0);
}

for (const policy of [...initial.atlasPolicies].sort((a, b) => a.name.localeCompare(b.name))) {
  if ((policy.enabled === true) === targetEnabled) continue;
  try {
    await patchEnabled(token, policy, targetEnabled);
  } catch (error) {
    fail(`No se pudo cambiar ${policy.name}: ${error.message}`);
  }
}

let postPolicies;
let postChannels;
try {
  [postPolicies, postChannels] = await Promise.all([
    listPages(token, 'alertPolicies', 'alertPolicies'),
    listPages(token, 'notificationChannels', 'notificationChannels'),
  ]);
} catch (error) {
  fail(`Las policies fueron actualizadas pero falló el post-check: ${error.message}`);
}
const post = validateInventory(postPolicies, postChannels);
if (post.atlasPolicies.some((policy) => (policy.enabled === true) !== targetEnabled)) {
  fail(`Post-check inválido: no todas las policies quedaron enabled=${targetEnabled}.`);
}

console.log(JSON.stringify({
  project: PROJECT,
  applied: true,
  action,
  alertPolicyCount: post.atlasPolicies.length,
  allAlertPoliciesEnabled: targetEnabled,
  allAlertPoliciesDisabled: !targetEnabled,
  alertPolicies: post.atlasPolicies.map(policySummary).sort((a, b) => a.name.localeCompare(b.name)),
  notificationChannelStillEnabled: post.channel.enabled === true,
  patchedFields: ['enabled'],
  thresholdsUnchanged: true,
  notificationAssociationsUnchanged: true,
  budgetsUntouched: true,
  applicationDataUntouched: true,
  storageV4WriteUnchanged: true,
  productionUntouched: true,
}, null, 2));
