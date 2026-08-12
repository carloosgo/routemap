/* global process, console */
import { spawnSync } from 'node:child_process';

const PROJECT = 'atlasmap-dev';
const applyRequested = process.argv.slice(2).includes('--apply');
const gcloudCandidates = process.platform === 'win32'
  ? ['gcloud.cmd', 'gcloud.exe', 'gcloud']
  : ['gcloud'];

function runWith(executable, args, { inherit = false } = {}) {
  const options = {
    encoding: inherit ? undefined : 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    windowsHide: true,
  };

  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const commandProcessor = process.env.ComSpec || 'cmd.exe';
    return spawnSync(commandProcessor, ['/d', '/c', executable, ...args], options);
  }

  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  let lastNotFound = null;
  for (const executable of gcloudCandidates) {
    const result = runWith(executable, ['--version']);
    if (result.error?.code === 'ENOENT') {
      lastNotFound = result.error;
      continue;
    }
    if (result.error) throw result.error;
    if (result.status === 0) return executable;
  }
  throw new Error(lastNotFound?.message || 'No se encontro gcloud en PATH.');
}

const gcloud = resolveGcloud();

function runGcloud(args, { inherit = false } = {}) {
  const result = runWith(gcloud, args, { inherit });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = inherit
      ? `gcloud termino con codigo ${result.status}`
      : String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || `gcloud termino con codigo ${result.status}`);
  }
  return result;
}

function gcloudText(args) {
  return String(runGcloud(args).stdout || '').trim();
}

function gcloudJson(args) {
  const text = gcloudText([...args, '--format=json']);
  if (!text) return [];
  return JSON.parse(text);
}

function databaseId(database) {
  return String(database?.name || '').split('/').at(-1) || '';
}

const activeAccount = gcloudText([
  'auth', 'list',
  '--filter=status:ACTIVE',
  '--format=value(account)',
]);
if (!activeAccount) {
  throw new Error('gcloud no tiene una cuenta autenticada activa.');
}

const databases = gcloudJson(['firestore', 'databases', 'list', `--project=${PROJECT}`]);
const restoreDatabases = databases.filter((database) =>
  databaseId(database).startsWith('atlas-restore-drill-')
);

if (restoreDatabases.length === 0) {
  console.log(JSON.stringify({
    project: PROJECT,
    applyRequested,
    cleanupNeeded: false,
    alreadyClean: true,
    restoreDatabaseCount: 0,
    deletesResources: false,
    touchesDefaultDatabase: false,
    enablesStorageV4Write: false,
    touchesProduction: false,
  }, null, 2));
  console.log('Restore cleanup: no existe ninguna base atlas-restore-drill-*; entorno ya limpio.');
  process.exit(0);
}

if (restoreDatabases.length !== 1) {
  throw new Error('Restore cleanup abortado: se esperaba como maximo una base atlas-restore-drill-* y se detectaron varias.');
}

const destinationDatabase = databaseId(restoreDatabases[0]);
if (!destinationDatabase.startsWith('atlas-restore-drill-')) {
  throw new Error('Restore cleanup abortado: el destino no cumple el prefijo aislado requerido.');
}
if (destinationDatabase === '(default)') {
  throw new Error('Restore cleanup abortado: nunca se permite operar sobre (default).');
}

const detail = gcloudJson([
  'firestore', 'databases', 'describe',
  `--database=${destinationDatabase}`,
  `--project=${PROJECT}`,
]);
const sourceBackup = String(detail?.sourceInfo?.backup?.backup || '');
const sourceOperation = String(detail?.sourceInfo?.operation || '');
const etag = String(detail?.etag || '');

if (!sourceBackup.startsWith(`projects/${PROJECT}/locations/`)) {
  throw new Error('Restore cleanup abortado: la base no expone una procedencia de backup del proyecto dev.');
}
if (!sourceOperation) {
  throw new Error('Restore cleanup abortado: la base no expone sourceInfo.operation de un restore administrado.');
}
if (!etag) {
  throw new Error('Restore cleanup abortado: falta etag; no se elimina sin precondicion de concurrencia.');
}

console.log(JSON.stringify({
  project: PROJECT,
  applyRequested,
  cleanupNeeded: true,
  restoreDatabaseCount: 1,
  destinationDatabase,
  managedRestoreLineagePresent: true,
  etagPreconditionPresent: true,
  deletesExactlyOneRestoreDatabase: applyRequested,
  touchesDefaultDatabase: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
  mutatesBudgets: false,
}, null, 2));

if (!applyRequested) {
  console.log('Dry-run: base temporal validada; no se elimino ninguna base.');
  process.exit(0);
}

runGcloud([
  'firestore', 'databases', 'delete',
  `--database=${destinationDatabase}`,
  `--etag=${etag}`,
  `--project=${PROJECT}`,
  '--quiet',
], { inherit: true });

const remaining = gcloudJson(['firestore', 'databases', 'list', `--project=${PROJECT}`]);
const remainingRestore = remaining.filter((database) =>
  databaseId(database).startsWith('atlas-restore-drill-')
);
if (remainingRestore.length !== 0) {
  throw new Error('Post-check invalido: aun existe una base atlas-restore-drill-* despues del cleanup.');
}

console.log(JSON.stringify({
  project: PROJECT,
  applied: true,
  deletedDatabase: destinationDatabase,
  remainingRestoreDatabaseCount: 0,
  defaultDatabaseUntouched: true,
  storageV4WriteUnchanged: true,
  budgetsUntouched: true,
  productionUntouched: true,
}, null, 2));
console.log('Restore cleanup completado: la base temporal fue eliminada y (default) permanecio intacta.');
