/* global process, console */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT = 'atlasmap-prod';
const LOCATION = 'us-central1';
const CONFIRMATION = 'ENABLE-ATLAS-V4-PROD-L2-RECOVERY';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseRetention(raw) {
  const match = /^(\d+)d$/.exec(String(raw || '').trim());
  if (!match) fail('--backup-retention debe expresarse en días, por ejemplo 7d.', 2);
  const days = Number(match[1]);
  if (!Number.isInteger(days) || days < 1 || days > 98) {
    fail('--backup-retention debe estar entre 1d y 98d (14 semanas).', 2);
  }
  return { raw: `${days}d`, days, seconds: days * 86400 };
}

function parseArgs(args = []) {
  let apply = false;
  let confirm = '';
  let retentionRaw = '';
  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else if (arg.startsWith('--backup-retention=')) retentionRaw = arg.slice('--backup-retention='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  if (!retentionRaw) fail('Falta --backup-retention. No existe retención default deliberadamente.', 2);
  const retention = parseRetention(retentionRaw);
  if (!apply && confirm) fail('--confirm solo se admite con --apply.', 2);
  if (apply && confirm !== CONFIRMATION) fail(`--apply exige --confirm=${CONFIRMATION}.`, 2);
  return { apply, retention };
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

function retentionSeconds(value) {
  if (typeof value !== 'string') return null;
  if (/^\d+s$/.test(value)) return Number(value.slice(0, -1));
  if (/^\d+d$/.test(value)) return Number(value.slice(0, -1)) * 86400;
  return null;
}

function isDaily(schedule) {
  return Object.prototype.hasOwnProperty.call(schedule || {}, 'dailyRecurrence') || schedule?.recurrence === 'DAILY' || schedule?.recurrence === 'daily';
}

function describeDatabase(gcloud) {
  return parseJson(runChecked(gcloud, [
    'firestore', 'databases', 'describe',
    '--database=(default)', `--project=${PROJECT}`, '--format=json',
  ], 'No se pudo describir Firestore productivo'), 'Firestore');
}

function listSchedules(gcloud) {
  const value = parseJson(runChecked(gcloud, [
    'firestore', 'backups', 'schedules', 'list',
    '--database=(default)', `--project=${PROJECT}`, '--format=json',
  ], 'No se pudieron listar backup schedules'), 'Backup schedules');
  return Array.isArray(value) ? value : [];
}

function assertDatabaseInvariant(database) {
  if (database?.locationId !== LOCATION) fail(`Firestore location inesperada: ${database?.locationId || 'unknown'}.`);
  if (database?.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') fail('Delete protection dejó de estar habilitada.');
}

async function main() {
  const { apply, retention } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L2',
    operation: 'configure-production-recovery',
    mode: apply ? 'apply' : 'plan',
    project: PROJECT,
    location: LOCATION,
    enablesPitr: true,
    pitrWindowDays: 7,
    createsDailyBackupScheduleIfMissing: true,
    backupRetentionExplicit: true,
    requestedBackupRetention: retention.raw,
    overwritesExistingSchedule: false,
    runsRestoreDrill: false,
    opensFirestoreRules: false,
    changesAuth: false,
    deploysFunctions: false,
    enablesStorageV4Read: false,
    enablesStorageV4Write: false,
    mutatesApplicationData: false,
    productionRecoveryMutation: apply,
    confirmationRequiredForApply: CONFIRMATION,
  }, null, 2));
  if (!apply) return;

  const gcloud = resolveCommand('gcloud');
  if (!gcloud) fail('No se encontró gcloud.');
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');

  let database = describeDatabase(gcloud);
  assertDatabaseInvariant(database);
  let schedules = listSchedules(gcloud);
  if (schedules.length > 1) fail(`Existen ${schedules.length} backup schedules productivos; se aborta para revisión manual.`);
  if (schedules.length === 1) {
    if (!isDaily(schedules[0])) fail('El backup schedule existente no es diario; no será sobrescrito automáticamente.');
    if (retentionSeconds(schedules[0]?.retention) !== retention.seconds) {
      fail(`El backup schedule existente tiene retención distinta de ${retention.raw}; no será sobrescrito automáticamente.`);
    }
  }
  console.log(JSON.stringify({
    stage: 'recovery-precheck-pass',
    pitrAlreadyEnabled: database?.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED',
    backupScheduleCountBefore: schedules.length,
  }, null, 2));

  if (database?.pointInTimeRecoveryEnablement !== 'POINT_IN_TIME_RECOVERY_ENABLED') {
    runChecked(gcloud, [
      'firestore', 'databases', 'update',
      '--database=(default)', `--project=${PROJECT}`, '--enable-pitr', '--quiet',
    ], 'No se pudo habilitar PITR');
    console.log(JSON.stringify({ stage: 'pitr-enabled', project: PROJECT }, null, 2));
  }

  if (schedules.length === 0) {
    runChecked(gcloud, [
      'firestore', 'backups', 'schedules', 'create',
      '--database=(default)', `--project=${PROJECT}`,
      '--recurrence=daily', `--retention=${retention.raw}`, '--quiet',
    ], 'No se pudo crear el backup schedule diario');
    console.log(JSON.stringify({
      stage: 'backup-schedule-created',
      project: PROJECT,
      recurrence: 'daily',
      retention: retention.raw,
    }, null, 2));
  }

  database = describeDatabase(gcloud);
  assertDatabaseInvariant(database);
  schedules = listSchedules(gcloud);
  if (database?.pointInTimeRecoveryEnablement !== 'POINT_IN_TIME_RECOVERY_ENABLED') fail('Post-check: PITR no quedó habilitado.');
  if (schedules.length !== 1 || !isDaily(schedules[0])) fail('Post-check: no quedó exactamente un backup schedule diario.');
  if (retentionSeconds(schedules[0]?.retention) !== retention.seconds) fail('Post-check: retención del backup schedule no coincide.');

  console.log(JSON.stringify({
    phase: 'L2',
    pass: true,
    project: PROJECT,
    pitrEnabled: true,
    pitrWindowDays: 7,
    dailyBackupSchedulePresent: true,
    backupRetention: retention.raw,
    restoreDrillPendingFirstReadyBackup: true,
    firestoreRulesOpened: false,
    authChanged: false,
    functionsDeployed: false,
    storageV4ReadEnabled: false,
    storageV4WriteEnabled: false,
    applicationDataMutated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
