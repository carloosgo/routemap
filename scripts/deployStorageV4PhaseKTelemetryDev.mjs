/* global process, console */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT = 'atlasmap-dev';
const FUNCTIONS = Object.freeze([
  'storageV4SyncTelemetry',
  'geoapifyCityAutocomplete',
]);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const apply = process.argv.slice(2).includes('--apply');

function resolveFirebaseCliScript() {
  const packageJsonPath = join(
    repoRoot,
    'node_modules',
    'firebase-tools',
    'package.json'
  );
  if (!existsSync(packageJsonPath)) return null;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const binEntry = typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.firebase;
    if (!binEntry) return null;

    const cliScript = join(dirname(packageJsonPath), binEntry);
    return existsSync(cliScript) ? cliScript : null;
  } catch {
    return null;
  }
}

const plan = {
  project: PROJECT,
  applyRequested: apply,
  functions: FUNCTIONS,
  purpose: 'Phase K telemetry evidence only',
  enablesStorageV4Write: false,
  touchesProduction: false,
};

console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log('Dry-run: agrega --apply para ejecutar este despliegue acotado en atlasmap-dev.');
  process.exit(0);
}

const firebaseCliScript = resolveFirebaseCliScript();
if (!firebaseCliScript) {
  console.error('No se encontró Firebase CLI local. Ejecuta npm install en la raíz del proyecto.');
  process.exit(1);
}

const only = FUNCTIONS.map((name) => `functions:${name}`).join(',');
const result = spawnSync(
  process.execPath,
  [
    firebaseCliScript,
    'deploy',
    '--only',
    only,
    '--project',
    PROJECT,
    '--non-interactive',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
