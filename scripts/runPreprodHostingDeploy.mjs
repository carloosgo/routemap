/* global process, console */
import * as fs from 'node:fs/promises';
import * as childProcess from 'node:child_process';
import * as pathModule from 'node:path';

export const PREPROD_PROJECT = 'atlasmap-dev';
export const PRODUCTION_PROJECT = 'atlasmap-prod';

export function spawnOptions(platform = process.platform) {
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

async function jsonFile(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function textFiles(root) {
  const entries = await fs.readdir(root);
  const files = [];
  for (const entry of entries) {
    const path = pathModule.join(root, entry);
    const info = await fs.stat(path);
    if (info.isDirectory()) files.push(...await textFiles(path));
    else if (/\.(?:html|js|css|json|txt|map)$/i.test(entry)) files.push(path);
  }
  return files;
}

export async function validatePreprodHostingConfig({
  firebaseConfigPath = 'firebase.json',
  firebasercPath = '.firebaserc',
} = {}) {
  const [firebaseConfig, firebaserc] = await Promise.all([
    jsonFile(firebaseConfigPath),
    jsonFile(firebasercPath),
  ]);
  if (firebaserc?.projects?.dev !== PREPROD_PROJECT) {
    throw new Error(`El alias dev debe apuntar a ${PREPROD_PROJECT}.`);
  }
  if (firebaserc?.projects?.prod !== PRODUCTION_PROJECT) {
    throw new Error(`El alias prod debe apuntar a ${PRODUCTION_PROJECT}.`);
  }
  if (firebaseConfig?.hosting?.public !== 'dist') {
    throw new Error('Firebase Hosting preprod debe publicar exclusivamente dist/.');
  }
  const rewrites = firebaseConfig?.hosting?.rewrites || [];
  if (!rewrites.some((rule) => rule?.source === '**' && rule?.destination === '/index.html')) {
    throw new Error('Firebase Hosting requiere fallback SPA hacia /index.html.');
  }
  return true;
}

export async function validateBuiltPreprodBundle({ distDir = 'dist' } = {}) {
  const files = await textFiles(distDir);
  if (!files.length) throw new Error('dist/ no contiene archivos de build verificables.');
  let sawPreprod = false;
  for (const path of files) {
    const text = await fs.readFile(path, 'utf8').catch(() => '');
    if (text.includes(PRODUCTION_PROJECT)) {
      throw new Error(`ABORTADO: el bundle contiene ${PRODUCTION_PROJECT} (${path}).`);
    }
    if (text.includes(PREPROD_PROJECT)) sawPreprod = true;
  }
  if (!sawPreprod) {
    throw new Error(`ABORTADO: el bundle no contiene ${PREPROD_PROJECT}; revisa VITE_FIREBASE_PROJECT_ID.`);
  }
  return true;
}

export function deployCommand() {
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
  await validatePreprodHostingConfig();
  if (!apply) {
    console.log(JSON.stringify({
      project: PREPROD_PROJECT,
      productionProject: PRODUCTION_PROJECT,
      mutatesHosting: true,
      touchesProduction: false,
      buildRequired: true,
      command: deployCommand().join(' '),
      applyRequiresExplicitFlag: '--apply',
    }, null, 2));
    return;
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  run(npm, ['run', 'build']);
  await validateBuiltPreprodBundle();
  run(npx, deployCommand());
}

if (process.argv[1]?.endsWith('runPreprodHostingDeploy.mjs')) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
