/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT = 'atlasmap-prod';
const WEB_APP_DISPLAY_NAME = 'AtlasMap Web Production';
const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(args = []) {
  for (const arg of args) {
    if (arg !== '--check-cloud') fail(`Argumento desconocido: ${arg}`, 2);
  }
  return { checkCloud: args.includes('--check-cloud') };
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const candidates = [`${name}.cmd`, `${name}.exe`, name];
  if (name === 'gcloud' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', hasPath ? basename(executable) : executable, ...args], {
      ...options,
      ...(hasPath ? { cwd: dirname(executable) } : {}),
    });
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of commandCandidates('gcloud')) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(executable, args, label) {
  const result = runProcess(executable, args);
  if (result.error) fail(`${label}: ${result.error.message}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) fail(`${label}: ${stderr || stdout || `exit ${result.status}`}`);
  return stdout;
}

function parseJson(raw, label) {
  try { return JSON.parse(raw || '{}'); }
  catch { fail(`${label}: respuesta JSON inválida.`); }
}

async function requestJson(url, token, { allow404 = false } = {}) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
    },
  });
  if (allow404 && response.status === 404) return null;
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) fail(`Google API HTTP ${response.status}: ${payload?.error?.message || payload?.raw || response.statusText}`);
  return payload;
}

function serviceEnabled(gcloud, service) {
  const value = runChecked(gcloud, [
    'services', 'list', '--enabled', `--project=${PROJECT}`,
    `--filter=config.name:${service}`, '--format=value(config.name)',
  ], `No se pudo consultar ${service}`);
  return value.split(/\r?\n/).map((item) => item.trim()).includes(service);
}

async function main() {
  const { checkCloud } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L3',
    mode: checkCloud ? 'read-only-cloud-check' : 'plan',
    project: PROJECT,
    webAppDisplayName: WEB_APP_DISPLAY_NAME,
    checksExistingClientAppCheckWiring: true,
    checksAppCheckApiEnabled: true,
    checksRecaptchaEnterpriseApiEnabled: true,
    checksExistingRecaptchaEnterpriseRegistrationWhenReadable: true,
    mutatesCloud: false,
    enablesApis: false,
    createsRecaptchaKey: false,
    registersAppCheck: false,
    enablesEnforcement: false,
    writesEnvironmentFiles: false,
    enablesStorageV4Read: false,
    enablesStorageV4Write: false,
  }, null, 2));
  if (!checkCloud) return;

  const gcloud = resolveGcloud();
  if (!gcloud) fail('No se encontró gcloud.');
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');

  const project = parseJson(runChecked(gcloud, [
    'projects', 'describe', PROJECT, '--format=json',
  ], 'No se pudo describir atlasmap-prod'), 'Proyecto productivo');
  const projectNumber = String(project?.projectNumber || '').trim();
  if (!/^\d+$/.test(projectNumber)) fail('No se pudo resolver projectNumber productivo.');

  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');
  const appsPayload = await requestJson(`${FIREBASE_API}/projects/${PROJECT}/webApps?pageSize=100`, token);
  const apps = Array.isArray(appsPayload?.apps) ? appsPayload.apps.filter((app) => app?.state !== 'DELETED') : [];
  const expected = apps.filter((app) => app?.displayName === WEB_APP_DISPLAY_NAME);
  if (apps.length !== 1 || expected.length !== 1 || !expected[0]?.appId) {
    fail(`Web App productiva inesperada: total=${apps.length}, esperadas=${expected.length}.`);
  }

  const appCheckApiEnabled = serviceEnabled(gcloud, 'firebaseappcheck.googleapis.com');
  const recaptchaEnterpriseApiEnabled = serviceEnabled(gcloud, 'recaptchaenterprise.googleapis.com');

  let enterpriseConfig = null;
  if (appCheckApiEnabled) {
    const appId = encodeURIComponent(expected[0].appId);
    enterpriseConfig = await requestJson(
      `${APP_CHECK_API}/projects/${projectNumber}/apps/${appId}/recaptchaEnterpriseConfig`,
      token,
      { allow404: true }
    );
  }

  console.log(JSON.stringify({
    phase: 'L3',
    pass: true,
    project: PROJECT,
    webAppCountObserved: apps.length,
    expectedWebAppPresent: true,
    appCheckApiEnabled,
    recaptchaEnterpriseApiEnabled,
    recaptchaEnterpriseConfigObserved: Boolean(enterpriseConfig),
    recaptchaEnterpriseSiteKeyConfigured: Boolean(enterpriseConfig?.siteKey),
    tokenTtlObserved: enterpriseConfig?.tokenTtl || null,
    riskThresholdObserved: enterpriseConfig?.riskAnalysis?.minValidScore ?? null,
    siteKeyValuePrinted: false,
    mutatesCloud: false,
    enforcementChanged: false,
    environmentFilesWritten: false,
    storageV4ReadEnabled: false,
    storageV4WriteEnabled: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
