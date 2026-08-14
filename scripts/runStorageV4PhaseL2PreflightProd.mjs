/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT = 'atlasmap-prod';
const LOCATION = 'us-central1';

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

function resolveCommand(name) {
  for (const candidate of commandCandidates(name)) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, name === 'gcloud' ? ['version'] : ['--version']);
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

async function requestJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
    },
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) fail(`Google API HTTP ${response.status}: ${payload?.error?.message || payload?.raw || response.statusText}`);
  return payload;
}

async function main() {
  const { checkCloud } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L2',
    mode: checkCloud ? 'read-only-cloud-check' : 'plan',
    project: PROJECT,
    location: LOCATION,
    checksPitr: true,
    checksBackupSchedules: true,
    checksExistingBackups: true,
    checksProjectScopedBudgets: true,
    mutatesCloud: false,
    changesFirestore: false,
    changesBudgets: false,
    deploysFunctions: false,
    opensFirestoreRules: false,
    enablesStorageV4Read: false,
    enablesStorageV4Write: false,
  }, null, 2));
  if (!checkCloud) return;

  const gcloud = resolveCommand('gcloud');
  if (!gcloud) fail('No se encontró gcloud.');
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');

  const database = parseJson(runChecked(gcloud, [
    'firestore', 'databases', 'describe',
    '--database=(default)', `--project=${PROJECT}`, '--format=json',
  ], 'No se pudo describir Firestore productivo'), 'Firestore');
  if (database?.locationId !== LOCATION) fail(`Firestore location inesperada: ${database?.locationId || 'unknown'}.`);
  if (database?.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') fail('Delete protection dejó de estar habilitada.');

  const schedules = parseJson(runChecked(gcloud, [
    'firestore', 'backups', 'schedules', 'list',
    '--database=(default)', `--project=${PROJECT}`, '--format=json',
  ], 'No se pudieron listar backup schedules'), 'Backup schedules');

  const backups = parseJson(runChecked(gcloud, [
    'firestore', 'backups', 'list',
    `--location=${LOCATION}`, `--project=${PROJECT}`, '--format=json',
  ], 'No se pudieron listar backups'), 'Backups');

  const billing = parseJson(runChecked(gcloud, [
    'billing', 'projects', 'describe', PROJECT, '--format=json',
  ], 'No se pudo describir billing'), 'Billing');
  if (billing?.billingEnabled !== true) fail('Billing productivo dejó de estar habilitado.');
  const billingAccountName = typeof billing?.billingAccountName === 'string' ? billing.billingAccountName : '';
  if (!/^billingAccounts\/[A-Z0-9-]+$/i.test(billingAccountName)) fail('No se pudo resolver billing account productiva.');

  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');
  const params = new URLSearchParams({ scope: `projects/${PROJECT}`, pageSize: '100' });
  const budgetPayload = await requestJson(
    `https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets?${params}`,
    token
  );
  const budgets = Array.isArray(budgetPayload?.budgets) ? budgetPayload.budgets : [];

  const pitrEnabled = database?.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED';
  const scheduleList = Array.isArray(schedules) ? schedules : [];
  const backupList = Array.isArray(backups) ? backups : [];

  console.log(JSON.stringify({
    phase: 'L2',
    pass: true,
    project: PROJECT,
    firestoreLocation: database.locationId,
    deleteProtectionEnabled: true,
    pitrEnabled,
    versionRetentionPeriod: database?.versionRetentionPeriod || null,
    backupScheduleCountObserved: scheduleList.length,
    readyBackupCountObserved: backupList.filter((item) => item?.state === 'READY').length,
    projectScopedBudgetCountObserved: budgets.length,
    billingAccountIdExposed: false,
    mutatesCloud: false,
    storageV4ReadEnabled: false,
    storageV4WriteEnabled: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
