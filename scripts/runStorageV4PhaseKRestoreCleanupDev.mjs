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

function validateRestoreDatabase(database) {
  const destinationDatabase = databaseId(database);
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
  const expectedName = `projects/${PROJECT}/databases/${destinationDatabase}`;
  const detailName = String(detail?.name || '');
  const sourceBackup = String(detail?.sourceInfo?.backup?.backup || '');
  const sourceOperation = String(detail?.sourceInfo?.operation || '');
  const progress = String(detail?.sourceInfo?.progress || '');
  const etag = String(detail?.etag || '');
  const locationId = String(detail?.locationId || '');

  if (detailName !== expectedName) {
    throw new Error(`Restore cleanup abortado: identidad inesperada para ${destinationDatabase}.`);
  }
  if (!sourceBackup.startsWith(`projects/${PROJECT}/locations/`)) {
    throw new Error(`Restore cleanup abortado: ${destinationDatabase} no expone una procedencia de backup del proyecto dev.`);
  }
  if (!sourceOperation.startsWith(`${expectedName}/operations/`)) {
    throw new Error(`Restore cleanup abortado: ${destinationDatabase} no expone sourceInfo.operation de su restore administrado.`);
  }
  if (progress !== 'COMPLETED') {
    throw new Error(`Restore cleanup abortado: ${destinationDatabase} no esta en estado COMPLETED.`);
  }
  if (!etag) {
    throw new Error(`Restore cleanup abortado: falta etag para ${destinationDatabase}; no se elimina sin precondicion de concurrencia.`);
  }

  return {
    destinationDatabase,
    sourceBackup,
    sourceOperation,
    progress,
    etag,
    locationId,
  };
}

const validatedRestores = restoreDatabases.map(validateRestoreDatabase);
const sourceBackups = new Set(validatedRestores.map((restore) => restore.sourceBackup));
const locations = new Set(validatedRestores.map((restore) => restore.locationId));

if (sourceBackups.size !== 1) {
  throw new Error('Restore cleanup abortado: las bases temporales no provienen del mismo backup administrado.');
}
if (locations.size !== 1) {
  throw new Error('Restore cleanup abortado: las bases temporales no pertenecen a la misma region.');
}

const destinationDatabases = validatedRestores.map((restore) => restore.destinationDatabase);
const sourceBackup = validatedRestores[0].sourceBackup;
const locationId = validatedRestores[0].locationId;

console.log(JSON.stringify({
  project: PROJECT,
  applyRequested,
  cleanupNeeded: true,
  restoreDatabaseCount: validatedRestores.length,
  destinationDatabases,
  sourceBackup,
  locationId,
  managedRestoreLineagePresentForAll: true,
  restoreProgressCompletedForAll: true,
  etagPreconditionPresentForAll: true,
  deletesRestoreDatabaseCount: applyRequested ? validatedRestores.length : 0,
  touchesDefaultDatabase: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
  mutatesBudgets: false,
}, null, 2));

if (!applyRequested) {
  console.log('Dry-run: bases temporales validadas; no se elimino ninguna base.');
  process.exit(0);
}

for (const restore of validatedRestores) {
  runGcloud([
    'firestore', 'databases', 'delete',
    `--database=${restore.destinationDatabase}`,
    `--etag=${restore.etag}`,
    `--project=${PROJECT}`,
    '--quiet',
  ], { inherit: true });
}

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
  deletedDatabases: destinationDatabases,
  deletedDatabaseCount: destinationDatabases.length,
  remainingRestoreDatabaseCount: 0,
  defaultDatabaseUntouched: true,
  storageV4WriteUnchanged: true,
  budgetsUntouched: true,
  productionUntouched: true,
}, null, 2));
console.log('Restore cleanup completado: las bases temporales validadas fueron eliminadas y (default) permanecio intacta.');
