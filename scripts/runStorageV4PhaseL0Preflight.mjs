/* global process, console */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';

const DEV_PROJECT = 'atlasmap-dev';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function option(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) fail(`${name} no puede repetirse.`, 2);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function requiredText(value, field) {
  if (!value) fail(`${field} es obligatorio.`, 2);
  return value;
}

function parseArgs(args = []) {
  for (const value of args) {
    if (value === '--check-cloud') continue;
    if (value.startsWith('--project=')) continue;
    if (value.startsWith('--location=')) continue;
    fail(`Argumento desconocido: ${value}`, 2);
  }

  const project = requiredText(option(args, '--project'), '--project');
  const location = requiredText(option(args, '--location'), '--location');
  if (project === DEV_PROJECT) {
    fail(`Phase L0 rechaza ${DEV_PROJECT}: se requiere un proyecto productivo explícito distinto de dev.`, 2);
  }

  return {
    project,
    location,
    checkCloud: args.includes('--check-cloud'),
  };
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
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    const command = hasPath ? basename(executable) : executable;
    const cmdOptions = hasPath ? { ...options, cwd: dirname(executable) } : options;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command, ...args], cmdOptions);
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
    fail(`gcloud falló en lectura L0: ${detail || args.join(' ')}`);
  }
  return String(result.stdout || '').trim();
}

function jsonFromGcloud(gcloud, args, label) {
  const text = runGcloud(gcloud, [...args, '--format=json']);
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} no devolvió JSON válido.`);
  }
}

function safePlan(options) {
  return {
    phase: 'L0',
    mode: options.checkCloud ? 'read-only-cloud-check' : 'local-plan',
    project: options.project,
    location: options.location,
    explicitProjectRequired: true,
    explicitLocationRequired: true,
    refusesDevProject: true,
    mutatesCloud: false,
    changesIam: false,
    changesBilling: false,
    changesFirestore: false,
    changesRemoteConfig: false,
    deploysFunctions: false,
    enablesStorageV4Write: false,
    productionMutationAuthorized: false,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = safePlan(options);
  console.log(JSON.stringify(plan, null, 2));

  if (!options.checkCloud) return;

  const gcloud = resolveGcloud();
  if (!gcloud) fail('No se encontró una instalación utilizable de gcloud para el preflight read-only L0.');

  const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
  if (!activeAccount || activeAccount === '(unset)') {
    fail('gcloud no tiene una cuenta autenticada activa.');
  }

  const project = jsonFromGcloud(
    gcloud,
    ['projects', 'describe', options.project],
    'projects describe'
  );
  if (project?.projectId !== options.project) {
    fail('El project ID devuelto por Google no coincide con --project.');
  }
  if (project?.lifecycleState && project.lifecycleState !== 'ACTIVE') {
    fail(`El proyecto ${options.project} no está ACTIVE.`);
  }

  const billing = jsonFromGcloud(
    gcloud,
    ['billing', 'projects', 'describe', options.project],
    'billing projects describe'
  );
  if (billing?.billingEnabled !== true) {
    fail(`Billing no está habilitado para ${options.project}.`);
  }

  const database = jsonFromGcloud(
    gcloud,
    [
      'firestore', 'databases', 'describe',
      '--database=(default)',
      `--project=${options.project}`,
    ],
    'firestore databases describe'
  );
  const observedLocation = typeof database?.locationId === 'string' ? database.locationId : '';
  if (!observedLocation) fail('Firestore no devolvió locationId para (default).');
  if (observedLocation !== options.location) {
    fail(`Location mismatch: se esperaba ${options.location} y Firestore reportó ${observedLocation}.`);
  }

  console.log(JSON.stringify({
    phase: 'L0',
    pass: true,
    project: options.project,
    projectActive: true,
    billingEnabled: true,
    firestoreDefaultDatabasePresent: true,
    firestoreLocation: observedLocation,
    requestedLocation: options.location,
    billingAccountIdExposed: false,
    mutatesCloud: false,
    productionMutationAuthorized: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
}
