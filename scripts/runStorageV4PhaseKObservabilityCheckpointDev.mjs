/* global process, console */
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const applyRequested = process.argv.slice(2).includes('--apply');
const applyScript = join(here, 'runStorageV4PhaseKObservabilityApplyDev.mjs');
const checkpointScript = join(here, 'runStorageV4PhaseKCloudCheckpoint.mjs');

console.log(JSON.stringify({
  project: 'atlasmap-dev',
  purpose: 'Phase K observability checkpoint in dev',
  applyRequested,
  mutatesCloud: applyRequested,
  mutationScope: applyRequested
    ? 'logs-based metrics + one dev dashboard + disabled dev alert policies only'
    : 'none',
  mutatesBudgets: false,
  enablesStorageV4Write: false,
  performsRestore: false,
  deletesResources: false,
  touchesProduction: false,
  postApplyReadOnlyCheckpoint: true,
}, null, 2));

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!applyRequested) {
  run(applyScript);
  console.log('\nDry-run completado. No se aplicó observabilidad ni se ejecutó ninguna mutación Cloud.');
  process.exit(0);
}

run(applyScript, ['--apply']);
console.log('\n=== Post-apply read-only checkpoint ===');
run(checkpointScript);
