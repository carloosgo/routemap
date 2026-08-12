/* global process, console */
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checks = Object.freeze([
  {
    name: 'recovery-billing-telemetry',
    script: join(here, 'runStorageV4PhaseKPreflight.mjs'),
  },
  {
    name: 'monitoring-inventory',
    script: join(here, 'runStorageV4PhaseKObservabilityPreflight.mjs'),
  },
  {
    name: 'restore-readiness',
    script: join(here, 'runStorageV4PhaseKRestorePreflight.mjs'),
  },
]);

console.log(JSON.stringify({
  project: 'atlasmap-dev',
  purpose: 'Phase K consolidated read-only cloud checkpoint',
  mutatesCloud: false,
  touchesProduction: false,
  checks: checks.map(({ name }) => name),
}, null, 2));

for (const check of checks) {
  console.log(`\n=== Phase K: ${check.name} ===`);
  const result = spawnSync(process.execPath, [check.script], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`${check.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
