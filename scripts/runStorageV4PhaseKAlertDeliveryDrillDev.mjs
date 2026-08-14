/* global process, console, fetch, setTimeout */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';
import { randomUUID } from 'node:crypto';

const PROJECT = 'atlasmap-dev';
const CONFIRMATION = 'RUN-ATLAS-V4-PHASE-K-ALERT-DRILL-DEV';
const CHANNEL_LABELS = Object.freeze({
  system: 'atlas-storage-v4',
  environment: 'dev',
  phase: 'k',
  purpose: 'alerts',
});
const LOG_METRIC_TYPE = 'logging.googleapis.com/user/atlas_storage_v4_sync_events';
const TEST_POLICY_PREFIX = 'Atlas Storage v4 — alert delivery drill — dev';
const TEST_LOG_NAME = 'atlas-storage-v4-phase-k-alert-drill';
const POLL_MS = 15_000;
const ALERT_TIMEOUT_MS = 12 * 60 * 1000;

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function argValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) fail(`${name} no puede repetirse.`, 2);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function parseArgs(args = []) {
  for (const value of args) {
    if (value === '--apply' || value.startsWith('--confirm=')) continue;
    fail(`Argumento desconocido: ${value}`, 2);
  }
  const apply = args.includes('--apply');
  const confirm = argValue(args, '--confirm');
  if (!apply && confirm) fail('--confirm solo se usa con --apply.', 2);
  if (apply && confirm !== CONFIRMATION) {
    fail(`--apply exige --confirm=${CONFIRMATION}.`, 2);
  }
  return { apply };
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
    const error = new Error(`Google API HTTP ${response.status}`);
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

function validateChannel(channels) {
  const matching = channels.filter(
    (channel) => channel?.type === 'email' && hasLabels(channel, CHANNEL_LABELS)
  );
  if (matching.length !== 1) fail('Debe existir exactamente un notification channel email Atlas Phase K.');
  const channel = matching[0];
  if (channel.enabled !== true) fail('El notification channel Atlas no está habilitado.');
  if (channel.verificationStatus === 'UNVERIFIED') fail('El notification channel Atlas está UNVERIFIED.');
  if (typeof channel.name !== 'string' || !channel.name.startsWith(`projects/${PROJECT}/notificationChannels/`)) {
    fail('El notification channel Atlas no tiene resource name válido.');
  }
  return channel;
}

function validateNoLeakedDrillPolicy(policies) {
  const leaked = policies.filter((policy) =>
    typeof policy?.displayName === 'string' && policy.displayName.startsWith(TEST_POLICY_PREFIX)
  );
  if (leaked.length) {
    fail(`Existe una policy de drill previa sin limpiar: ${leaked.map((item) => item.name).join(', ')}`);
  }
}

async function createDrillPolicy(token, channel, drillId) {
  const displayName = `${TEST_POLICY_PREFIX} ${drillId}`;
  const body = {
    displayName,
    combiner: 'OR',
    enabled: true,
    notificationChannels: [channel.name],
    documentation: {
      mimeType: 'text/markdown',
      content: 'Temporary Phase K dev alert-delivery drill. Synthetic signal only. The runner deletes this policy in finally.',
    },
    userLabels: {
      system: 'atlas-storage-v4',
      environment: 'dev',
      phase: 'k',
      purpose: 'alert-drill',
    },
    conditions: [
      {
        displayName: 'Synthetic sync unexpected-error > 0',
        conditionThreshold: {
          filter: `resource.type="cloud_run_revision" AND metric.type="${LOG_METRIC_TYPE}" AND metric.labels.event="flush" AND metric.labels.outcome="unexpected-error" AND metric.labels.reason="${drillId}"`,
          aggregations: [
            {
              alignmentPeriod: '60s',
              perSeriesAligner: 'ALIGN_DELTA',
              crossSeriesReducer: 'REDUCE_SUM',
            },
          ],
          comparison: 'COMPARISON_GT',
          thresholdValue: 0,
          duration: '0s',
          trigger: { count: 1 },
        },
      },
    ],
  };
  const policy = await requestJson(
    `https://monitoring.googleapis.com/v3/projects/${PROJECT}/alertPolicies`,
    { token, method: 'POST', body }
  );
  if (!policy?.name || policy.displayName !== displayName || policy.enabled !== true) {
    fail('Monitoring no devolvió la policy temporal esperada.');
  }
  return policy;
}

async function deletePolicy(token, policyName) {
  const response = await fetch(`https://monitoring.googleapis.com/v3/${policyName}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
    },
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`No se pudo eliminar la policy temporal: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
}

function writeSyntheticSyncError(gcloud, drillId) {
  const payload = JSON.stringify({
    message: 'storage_v4_sync_metric',
    event: 'flush',
    outcome: 'unexpected-error',
    reason: drillId,
    synthetic: true,
    phase: 'k-alert-drill',
  });
  runGcloud(gcloud, [
    'logging', 'write', TEST_LOG_NAME, payload,
    '--payload-type=json',
    '--severity=ERROR',
    '--monitored-resource-type=cloud_run_revision',
    `--monitored-resource-labels=project_id=${PROJECT},service_name=atlas-phase-k-alert-drill,revision_name=atlas-phase-k-alert-drill-00001,location=us-central1,configuration_name=atlas-phase-k-alert-drill`,
    `--project=${PROJECT}`,
  ]);
}

async function listAlerts(token) {
  const alerts = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '100', orderBy: 'openTime desc' });
    if (pageToken) params.set('pageToken', pageToken);
    const payload = await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${PROJECT}/alerts?${params}`,
      { token }
    );
    alerts.push(...(Array.isArray(payload?.alerts) ? payload.alerts : []));
    pageToken = typeof payload?.nextPageToken === 'string' ? payload.nextPageToken : '';
    if (alerts.length >= 300) break;
  } while (pageToken);
  return alerts;
}

async function waitForDrillAlert(token, policyName, startedAtMs) {
  const deadline = Date.now() + ALERT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const alerts = await listAlerts(token);
    const match = alerts.find((alert) => {
      const openMs = Date.parse(alert?.openTime || '');
      return alert?.policy?.name === policyName
        && Number.isFinite(openMs)
        && openMs >= startedAtMs - 30_000;
    });
    if (match) {
      return {
        name: match.name,
        state: match.state || null,
        openTime: match.openTime || null,
        metricType: match.metric?.type || null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  fail(`No apareció un incidente del drill dentro de ${Math.round(ALERT_TIMEOUT_MS / 60000)} minutos.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const gcloud = resolveGcloud();
  if (!gcloud) fail('No se encontró una instalación utilizable de gcloud.');
  const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
  if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const configuredProject = runGcloud(gcloud, ['config', 'get-value', 'project']);
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este drill solo admite ${PROJECT}.`);
  }
  const token = runGcloud(gcloud, ['auth', 'print-access-token']);
  if (!token) fail('No se pudo obtener un access token de gcloud.');

  const [policies, channels] = await Promise.all([
    listPages(token, 'alertPolicies', 'alertPolicies'),
    listPages(token, 'notificationChannels', 'notificationChannels'),
  ]);
  validateNoLeakedDrillPolicy(policies);
  const channel = validateChannel(channels);

  console.log(JSON.stringify({
    project: PROJECT,
    mode: options.apply ? 'apply' : 'dry-run',
    test: 'temporary-sync-alert-delivery-drill',
    createsTemporaryAlertPolicy: options.apply,
    writesOneSyntheticLogEntry: options.apply,
    waitsForMonitoringIncident: options.apply,
    deletesTemporaryPolicyInFinally: true,
    reusesNotificationChannel: channel.name,
    mutatesApplicationData: false,
    mutatesBudgets: false,
    changesPermanentAlertPolicies: false,
    enablesStorageV4Write: false,
    touchesProduction: false,
  }, null, 2));

  if (!options.apply) return;

  const drillId = `phase-k-alert-drill-${randomUUID().slice(0, 8)}`;
  let policy = null;
  let cleanupOk = false;
  const startedAtMs = Date.now();

  try {
    policy = await createDrillPolicy(token, channel, drillId);
    console.log(JSON.stringify({ stage: 'policy-created', name: policy.name, drillId }, null, 2));
    writeSyntheticSyncError(gcloud, drillId);
    console.log(JSON.stringify({ stage: 'synthetic-signal-written', drillId }, null, 2));
    const alert = await waitForDrillAlert(token, policy.name, startedAtMs);
    console.log(JSON.stringify({
      project: PROJECT,
      pass: true,
      incidentObserved: true,
      alert,
      notificationChannelAssociated: true,
      emailReceiptVerifiedInBand: false,
      syntheticSignalOnly: true,
      permanentPoliciesChanged: false,
      applicationDataMutated: false,
      productionMutated: false,
    }, null, 2));
  } finally {
    if (policy?.name) {
      try {
        await deletePolicy(token, policy.name);
        cleanupOk = true;
        console.log(JSON.stringify({ stage: 'cleanup', temporaryPolicyDeleted: true, name: policy.name }, null, 2));
      } catch (error) {
        console.error(error?.message || error);
        console.error(`RECOVERY: elimina manualmente la policy temporal ${policy.name}.`);
      }
    }
    if (policy?.name && !cleanupOk) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
