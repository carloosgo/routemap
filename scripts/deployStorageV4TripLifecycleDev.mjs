/* global process, console */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROJECT = 'atlasmap-dev';
export const FUNCTION_NAME = 'v4TripLifecycle';
export const CONFIRMATION = 'DEPLOY-ATLAS-V4-TRIP-LIFECYCLE-DEV';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const functionsIndexPath = join(repoRoot, 'functions', 'index.js');

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

export function parseArgs(args = []) {
  const allowed = new Set(['--apply']);
  for (const value of args) {
    if (allowed.has(value) || value.startsWith('--confirm=')) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  const apply = args.includes('--apply');
  if (args.filter((value) => value === '--apply').length > 1) {
    throw new TypeError('--apply no puede repetirse.');
  }
  const confirmation = argumentValue(args, '--confirm');
  if (!apply && confirmation) {
    throw new TypeError('--confirm solo se usa con --apply.');
  }
  if (apply && confirmation !== CONFIRMATION) {
    throw new TypeError(`--apply exige --confirm=${CONFIRMATION}.`);
  }
  return Object.freeze({ apply, confirmation });
}

function resolveFirebaseCliScript() {
  const packageJsonPath = join(repoRoot, 'node_modules', 'firebase-tools', 'package.json');
  if (!existsSync(packageJsonPath)) return null;
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const binEntry = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.firebase;
    if (!binEntry) return null;
    const cliScript = join(dirname(packageJsonPath), binEntry);
    return existsSync(cliScript) ? cliScript : null;
  } catch {
    return null;
  }
}

function runFirebase(firebaseCliScript, args) {
  const result = spawnSync(process.execPath, [firebaseCliScript, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Firebase CLI terminó con código ${result.status ?? 1}.`);
  }
}

export function assertCanonicalLifecycleExport(indexSource) {
  if (typeof indexSource !== 'string') throw new TypeError('indexSource debe ser texto.');
  const exportBlock = /export\s*\{[\s\S]*?\bv4TripLifecycle\b[\s\S]*?\}\s*from\s*['"]\.\/v4BackendExports\.js['"]/m;
  if (!exportBlock.test(indexSource)) {
    throw new Error(
      'functions/index.js debe exportar v4TripLifecycle desde ./v4BackendExports.js antes del deploy.'
    );
  }
  return true;
}

export function deployStorageV4TripLifecycleDev({
  args = process.argv.slice(2),
  indexSource = readFileSync(functionsIndexPath, 'utf8'),
  firebaseCliScript = resolveFirebaseCliScript(),
  executeFirebase = runFirebase,
  log = (value) => console.log(value),
} = {}) {
  const options = parseArgs(args);
  assertCanonicalLifecycleExport(indexSource);

  const visiblePlan = Object.freeze({
    project: PROJECT,
    function: FUNCTION_NAME,
    applyRequested: options.apply,
    deploysFunctions: options.apply ? [FUNCTION_NAME] : [],
    deploysRules: false,
    mutatesRemoteConfig: false,
    mutatesApplicationData: false,
    touchesProduction: false,
    usesCanonicalFunctionsIndex: true,
  });
  log(JSON.stringify(visiblePlan, null, 2));

  if (!options.apply) {
    log('Dry-run: no se desplegó ninguna Function.');
    return visiblePlan;
  }
  if (!firebaseCliScript) {
    throw new Error('No se encontró Firebase CLI local. Ejecuta npm install en la raíz del proyecto.');
  }

  executeFirebase(firebaseCliScript, [
    'deploy',
    '--only',
    `functions:${FUNCTION_NAME}`,
    '--project',
    PROJECT,
    '--non-interactive',
  ]);

  const result = Object.freeze({
    project: PROJECT,
    function: FUNCTION_NAME,
    deployed: true,
    deploysRules: false,
    mutatesRemoteConfig: false,
    mutatesApplicationData: false,
    touchesProduction: false,
    usesCanonicalFunctionsIndex: true,
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    deployStorageV4TripLifecycleDev();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
