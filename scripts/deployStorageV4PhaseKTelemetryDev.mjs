/* global process, console */
import { existsSync } from 'node:fs';
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
const firebaseBinary = join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
);
const apply = process.argv.slice(2).includes('--apply');

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

if (!existsSync(firebaseBinary)) {
  console.error('No se encontró Firebase CLI local. Ejecuta npm install en la raíz del proyecto.');
  process.exit(1);
}

const only = FUNCTIONS.map((name) => `functions:${name}`).join(',');
const result = spawnSync(
  firebaseBinary,
  [
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
