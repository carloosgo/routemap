/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';

const PROJECT = 'atlasmap-dev';
const DISPLAY_NAME = 'Atlas Storage v4 — dev alerts';
const DESCRIPTION = 'Phase K development alert channel for Atlas Storage v4';
const USER_LABELS = Object.freeze({
  system: 'atlas-storage-v4',
  environment: 'dev',
  phase: 'k',
  purpose: 'alerts',
});
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const emailArgs = argv.filter((arg) => arg.startsWith('--email='));
  if (emailArgs.length !== 1) {
    fail('Debes indicar exactamente un destino con --email=<direccion>.', 2);
  }

  const email = emailArgs[0].slice('--email='.length).trim();
  if (
    email.length < 3 ||
    email.length > 254 ||
    /[\r\n\0]/.test(email) ||
    !EMAIL_PATTERN.test(email)
  ) {
    fail('La direccion indicada en --email no tiene un formato valido.', 2);
  }

  return { apply, email };
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

const { apply, email } = parseArgs(process.argv.slice(2));
const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud en PATH o en Google Cloud SDK.');

const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

let existingChannels;
try {
  existingChannels = (await listChannels(token)).filter(isManagedAtlasEmailChannel);
} catch (error) {
  fail(`No se pudo inventariar notification channels: ${error.message}`);
}

if (existingChannels.length > 1) {
  fail('Se detecto mas de un email notification channel administrado por Atlas Phase K; no se crea ni modifica ninguno.');
}

const existing = existingChannels[0] || null;
const plan = {
  project: PROJECT,
  applyRequested: apply,
  transport: 'monitoring-rest-v3',
  channelType: 'email',
  emailAddressProvided: true,
  emailAddressExposed: false,
  existingManagedChannelCount: existingChannels.length,
  existingManagedChannel: existing ? safeChannelSummary(existing) : null,
  createNeeded: !existing,
  createsDisabledChannel: Boolean(apply && !existing),
  associatesAlertPolicies: false,
  enablesAlertPolicies: false,
  mutatesBudgets: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log('Dry-run: no se creo ningun notification channel.');
  process.exit(0);
}

if (existing) {
  console.log('Notification channel: ya existe exactamente un canal email Atlas Phase K; no se creo otro.');
  process.exit(0);
}

const createBody = {
  type: 'email',
  displayName: DISPLAY_NAME,
  description: DESCRIPTION,
  labels: { email_address: email },
  userLabels: USER_LABELS,
  enabled: false,
};

let created;
try {
  created = await requestJson(
    `https://monitoring.googleapis.com/v3/projects/${PROJECT}/notificationChannels`,
    { token, method: 'POST', body: createBody }
  );
} catch (error) {
  fail(`No se pudo crear el notification channel: ${error.message}`);
}

if (
  !created ||
  created.type !== 'email' ||
  typeof created.name !== 'string' ||
  !created.name.startsWith(`projects/${PROJECT}/notificationChannels/`) ||
  created.enabled === true ||
  !isManagedAtlasEmailChannel(created)
) {
  fail('La respuesta de creacion no cumple el contrato seguro esperado; revisar Cloud Monitoring antes de continuar.');
}

let postChannels;
try {
  postChannels = (await listChannels(token)).filter(isManagedAtlasEmailChannel);
} catch (error) {
  fail(`El canal fue creado pero fallo el post-check de inventario: ${error.message}`);
}

if (postChannels.length !== 1 || postChannels[0]?.name !== created.name) {
  fail('Post-check invalido: no quedo exactamente el notification channel Atlas esperado.');
}

console.log(
  JSON.stringify(
    {
      project: PROJECT,
      applied: true,
      created: true,
      transport: 'monitoring-rest-v3',
      channel: safeChannelSummary(postChannels[0]),
      emailAddressExposed: false,
      alertPoliciesUntouched: true,
      alertPoliciesRemainDisabled: true,
      budgetsUntouched: true,
      storageV4WriteUnchanged: true,
      productionUntouched: true,
    },
    null,
    2
  )
);
