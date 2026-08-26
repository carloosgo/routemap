/* global process, console */
import * as fs from 'node:fs/promises';
import * as childProcess from 'node:child_process';
import {
  PREPROD_PROJECT,
  PRODUCTION_PROJECT,
  validatePreprodHostingConfig,
  validateBuiltPreprodBundle,
} from './runPreprodHostingDeploy.mjs';

export const PREPROD_CITY_FUNCTION = 'geoapifyCityAutocomplete';

function spawnOptions(platform = process.platform) {
  return {
    stdio: 'inherit',
    shell: platform === 'win32',
  };
}

function run(command, args) {
  const result = childProcess.spawnSync(command, args, spawnOptions());
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} terminó con código ${result.status}.`);
  }
}

async function text(path) {
  return fs.readFile(path, 'utf8');
}

export async function validateCurrentPreprodDeploy({
  firebaseConfigPath = 'firebase.json',
  firebasercPath = '.firebaserc',
  functionsIndexPath = 'functions/index.js',
  cityFunctionPath = 'functions/geoapifyCityFunctions.js',
  cityCatalogPath = 'functions/cityCatalog.js',
} = {}) {
  await validatePreprodHostingConfig({ firebaseConfigPath, firebasercPath });

  const [firebaseConfigRaw, functionsIndex, cityFunction, cityCatalog] = await Promise.all([
    text(firebaseConfigPath),
    text(functionsIndexPath),
    text(cityFunctionPath),
    text(cityCatalogPath),
  ]);
  const firebaseConfig = JSON.parse(firebaseConfigRaw);

  if (firebaseConfig?.functions?.source !== 'functions') {
    throw new Error('Firebase Functions preprod debe desplegar exclusivamente functions/.');
  }
  if (firebaseConfig?.functions?.runtime !== 'nodejs22') {
    throw new Error('Firebase Functions preprod debe conservar runtime nodejs22.');
  }
  if (!functionsIndex.includes(`export { ${PREPROD_CITY_FUNCTION} } from './geoapifyCityFunctions.js';`)) {
    throw new Error(`functions/index.js no exporta ${PREPROD_CITY_FUNCTION}.`);
  }
  if (!cityFunction.includes("from './cityCatalog.js'")) {
    throw new Error('La Function de ciudades no está conectada al catálogo Atlas.');
  }
  if (!cityCatalog.includes("cities: 'cityCatalog'")) {
    throw new Error('El catálogo Atlas esperado no está presente.');
  }

  return true;
}

export function functionDeployCommand() {
  return [
    'firebase',
    'deploy',
    '--only',
    `functions:${PREPROD_CITY_FUNCTION}`,
    '--project',
    PREPROD_PROJECT,
    '--config',
    'firebase.json',
  ];
}

export function hostingDeployCommand() {
  return [
    'firebase',
    'deploy',
    '--only',
    'hosting',
    '--project',
    PREPROD_PROJECT,
    '--config',
    'firebase.json',
  ];
}

export async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  await validateCurrentPreprodDeploy();

  const plan = {
    project: PREPROD_PROJECT,
    productionProject: PRODUCTION_PROJECT,
    touchesProduction: false,
    deploysFunctions: [PREPROD_CITY_FUNCTION],
    deploysHosting: true,
    deploysFirestoreRules: false,
    deploysFirestoreIndexes: false,
    order: ['functions', 'hosting'],
    functionCommand: functionDeployCommand().join(' '),
    hostingCommand: hostingDeployCommand().join(' '),
    applyRequiresExplicitFlag: '--apply',
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  // Gate local: no mutación remota si regresión, Rules, lint o build fallan.
  run(npm, ['run', 'verify:local']);
  run(npm, ['run', 'test:rules']);
  await validateBuiltPreprodBundle();

  // Backend first: el frontend actualmente desplegado sigue siendo compatible con
  // la respuesta nueva. Si Hosting fallara después, preprod no queda roto.
  run(npx, functionDeployCommand());
  run(npx, hostingDeployCommand());

  console.log(JSON.stringify({ ...plan, deployed: true }, null, 2));
}

if (process.argv[1]?.endsWith('runPreprodCurrentDeploy.mjs')) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
