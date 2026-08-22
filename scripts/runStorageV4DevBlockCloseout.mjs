/* global process, console */
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const confirmation = 'ADVANCE-ATLAS-V4-PILOT-DEV';

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function required(value, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new TypeError(`${name} es obligatorio.`);
  return text;
}

function parseArgs(args) {
  const allowed = new Set(['--apply']);
  const prefixes = ['--uid=', '--legacy-trip-id=', '--deleted-v4-trip-id=', '--confirm='];
  for (const value of args) {
    if (allowed.has(value) || prefixes.some((prefix) => value.startsWith(prefix))) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  if (!args.includes('--apply')) throw new TypeError('Este runner de cierre exige --apply.');
  const confirm = argumentValue(args, '--confirm');
  if (confirm !== confirmation) throw new TypeError(`Se exige --confirm=${confirmation}.`);
  return {
    uid: required(argumentValue(args, '--uid'), '--uid'),
    legacyTripId: required(argumentValue(args, '--legacy-trip-id'), '--legacy-trip-id'),
    deletedV4TripId: required(argumentValue(args, '--deleted-v4-trip-id'), '--deleted-v4-trip-id'),
  };
}

function runNode(label, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) throw new Error(`${label} falló con código ${result.status ?? 1}.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    project: 'atlasmap-dev',
    purpose: 'Storage v4 batched dev closeout',
    steps: [
      'real migration + rollback + remigration',
      'isolated real purge drill',
      'local resilience suite',
      'Phase K consolidated read-only cloud checkpoint',
    ],
    productionMutated: false,
  }, null, 2));

  runNode('Pilot migration/purge advance', [
    join(repoRoot, 'functions', 'runV4PilotAdvanceDev.js'),
    `--uid=${options.uid}`,
    `--legacy-trip-id=${options.legacyTripId}`,
    `--deleted-v4-trip-id=${options.deletedV4TripId}`,
    '--apply',
    `--confirm=${confirmation}`,
  ]);

  runNode('Phase K local resilience', [
    '--test',
    join(repoRoot, 'functions', 'geoapifySupport.resilience.test.js'),
    join(repoRoot, 'test', 'sharedProviderCacheResilience.test.js'),
    join(repoRoot, 'test', 'storageV4ReconnectionStorm.test.js'),
    join(repoRoot, 'test', 'storageV4ReconnectCapacitySimulation.test.js'),
    join(repoRoot, 'test', 'storageV4MultiDeviceSimulation.test.js'),
    join(repoRoot, 'test', 'storageV4MultiDeviceContentionSimulation.test.js'),
  ]);

  runNode('Phase K cloud checkpoint', [
    join(repoRoot, 'scripts', 'runStorageV4PhaseKCloudCheckpoint.mjs'),
  ]);

  console.log(JSON.stringify({
    project: 'atlasmap-dev',
    block: 'pilot-migration-purge-phase-k-checkpoint',
    pass: true,
    productionMutated: false,
    next: 'general review of remaining K/J/L gaps',
  }, null, 2));
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invoked === modulePath) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
