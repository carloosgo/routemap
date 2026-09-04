/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';

const PROJECT = 'atlasmap-dev';
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

function parseArgs(argv) {
  const unknown = argv.filter((arg) => arg !== '--apply');
  if (unknown.length > 0) {
    fail(`Argumentos no reconocidos: ${unknown.join(', ')}`, 2);
  }
  return { apply: argv.includes('--apply') };
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

async function listResourcePages(token, resource, responseField) {
  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${PROJECT}/${resource}?${params}`,
      { token }
    );
    items.push(...(Array.isArray(response?.[responseField]) ? response[responseField] : []));
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
  return {
    name: typeof policy?.name === 'string' ? policy.name : null,
    displayName: typeof policy?.displayName === 'string' ? policy.displayName : null,
    enabled: policy?.enabled === true,
    notificationChannels: normalizeChannels(policy),
  };
}

function channelSummary(channel) {
  return {
    name: typeof channel?.name === 'string' ? channel.name : null,
    displayName: typeof channel?.displayName === 'string' ? channel.displayName : null,
    type: typeof channel?.type === 'string' ? channel.type : null,
    enabled: channel?.enabled === true,
    verificationStatus:
      typeof channel?.verificationStatus === 'string' ? channel.verificationStatus : null,
  };
}

function validateState(allPolicies, allChannels) {
  const atlasPolicies = allPolicies.filter((policy) => hasLabels(policy, ATLAS_LABELS));
  const atlasPolicyNames = atlasPolicies.map((policy) => policy?.name).sort();
  const expectedNames = [...EXPECTED_POLICY_NAMES].sort();
  if (
    atlasPolicies.length !== EXPECTED_POLICY_NAMES.length ||
    JSON.stringify(atlasPolicyNames) !== JSON.stringify(expectedNames)
  ) {
    fail('El inventario de alert policies Atlas Phase K no coincide exactamente con las 3 policies esperadas.');
  }

  if (atlasPolicies.some((policy) => policy?.enabled === true)) {
    fail('Al menos una alert policy Atlas Phase K esta habilitada; se aborta antes de asociar canales.');
  }

  const managedChannels = allChannels.filter(
    (channel) => channel?.type === 'email' && hasLabels(channel, CHANNEL_LABELS)
  );
  if (managedChannels.length !== 1) {
    fail('Debe existir exactamente un notification channel email administrado por Atlas Phase K.');
  }

  const channel = managedChannels[0];
  if (channel?.enabled === true) {
    fail('El notification channel Atlas debe permanecer deshabilitado durante esta asociacion.');
  }
  if (channel?.verificationStatus === 'UNVERIFIED') {
    fail('El notification channel Atlas esta UNVERIFIED y no se asociara a las policies.');
  }
  if (typeof channel?.name !== 'string' || !channel.name.startsWith(`projects/${PROJECT}/notificationChannels/`)) {
    fail('El notification channel Atlas no tiene un resource name valido para atlasmap-dev.');
  }

  for (const policy of atlasPolicies) {
    const channels = normalizeChannels(policy);
    const allowed = channels.length === 0 || (channels.length === 1 && channels[0] === channel.name);
    if (!allowed) {
      fail(`La policy ${policy.name} tiene notification channels inesperados; no se modifica.`);
    }
  }

  return { atlasPolicies, channel };
}

function buildPolicyPatchBody(policyName, channelName) {
  return {
    name: policyName,
    notificationChannels: [channelName],
  };
}

async function patchPolicyChannel(token, policy, channelName) {
  const params = new URLSearchParams({ updateMask: 'notificationChannels' });
  const updated = await requestJson(
    `https://monitoring.googleapis.com/v3/${policy.name}?${params}`,
    {
      token,
      method: 'PATCH',
      body: buildPolicyPatchBody(policy.name, channelName),
    }
  );

  if (
    !updated ||
    updated.name !== policy.name ||
    updated.enabled === true ||
    JSON.stringify(normalizeChannels(updated)) !== JSON.stringify([channelName])
  ) {
    fail(`La respuesta PATCH de ${policy.name} no cumple el contrato seguro esperado.`);
  }
  return updated;
}

const { apply } = parseArgs(process.argv.slice(2));
const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud en PATH o en Google Cloud SDK.');

const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

let policies;
let channels;
try {
  [policies, channels] = await Promise.all([
    listResourcePages(token, 'alertPolicies', 'alertPolicies'),
    listResourcePages(token, 'notificationChannels', 'notificationChannels'),
  ]);
} catch (error) {
  fail(`No se pudo inventariar Cloud Monitoring: ${error.message}`);
}

const initial = validateState(policies, channels);
const policiesToAssociate = initial.atlasPolicies.filter(
  (policy) => normalizeChannels(policy).length === 0
);

console.log(
  JSON.stringify(
    {
      project: PROJECT,
      applyRequested: apply,
      transport: 'monitoring-rest-v3',
      expectedAlertPolicyCount: EXPECTED_POLICY_NAMES.length,
      alertPolicyCount: initial.atlasPolicies.length,
      allAlertPoliciesDisabled: initial.atlasPolicies.every((policy) => policy?.enabled !== true),
      managedNotificationChannel: channelSummary(initial.channel),
      channelRemainsDisabled: initial.channel?.enabled !== true,
      alreadyAssociatedPolicyCount: initial.atlasPolicies.length - policiesToAssociate.length,
      associationNeededPolicyCount: policiesToAssociate.length,
      patchesOnlyNotificationChannels: true,
      changesAlertPolicyEnabled: false,
      enablesNotificationChannel: false,
      mutatesBudgets: false,
      enablesStorageV4Write: false,
      touchesProduction: false,
    },
    null,
    2
  )
);

if (!apply) {
  console.log('Dry-run: no se modifico ninguna alert policy.');
  process.exit(0);
}

for (const policy of [...policiesToAssociate].sort((a, b) => a.name.localeCompare(b.name))) {
  try {
    await patchPolicyChannel(token, policy, initial.channel.name);
  } catch (error) {
    fail(`Fallo la asociacion segura de ${policy.name}: ${error.message}`);
  }
}

let postPolicies;
let postChannels;
try {
  [postPolicies, postChannels] = await Promise.all([
    listResourcePages(token, 'alertPolicies', 'alertPolicies'),
    listResourcePages(token, 'notificationChannels', 'notificationChannels'),
  ]);
} catch (error) {
  fail(`La asociacion termino pero fallo el post-check de Cloud Monitoring: ${error.message}`);
}

const post = validateState(postPolicies, postChannels);
const postPolicySummaries = post.atlasPolicies.map(policySummary);
if (
  postPolicySummaries.some(
    (policy) =>
      policy.enabled ||
      policy.notificationChannels.length !== 1 ||
      policy.notificationChannels[0] !== post.channel.name
  )
) {
  fail('Post-check invalido: las 3 policies no quedaron deshabilitadas y asociadas al unico canal esperado.');
}
if (post.channel?.enabled === true) {
  fail('Post-check invalido: el notification channel fue habilitado inesperadamente.');
}

console.log(
  JSON.stringify(
    {
      project: PROJECT,
      applied: true,
      transport: 'monitoring-rest-v3',
      associatedPolicyCount: postPolicySummaries.length,
      alertPolicies: postPolicySummaries,
      notificationChannel: channelSummary(post.channel),
      alertPoliciesRemainDisabled: true,
      notificationChannelRemainsDisabled: true,
      patchedFields: ['notificationChannels'],
      budgetsUntouched: true,
      storageV4WriteUnchanged: true,
      productionUntouched: true,
    },
    null,
    2
  )
);
