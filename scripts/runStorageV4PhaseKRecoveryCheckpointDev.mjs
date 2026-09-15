/* global process, console */
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const applyRequested = process.argv.slice(2).includes('--apply');

const steps = Object.freeze([
  {
    name: 'restore-drill-and-validate',
    script: join(here, 'runStorageV4PhaseKRestoreCheckpointDev.mjs'),
  },
  {
    name: 'cleanup-duplicate-dashboard',
    script: join(here, 'runStorageV4PhaseKDashboardCleanupDev.mjs'),
  },
]);

console.log(JSON.stringify({
  project: 'atlasmap-dev',
  purpose: 'Phase K recovery checkpoint in dev',
  applyRequested,
  deletesOnlyVerifiedDuplicateDashboard: true,
  createsTemporaryRestoreDatabase: true,
  validatesRestoredContent: true,
  restoreRunsBeforeNonCriticalDashboardCleanup: true,
  mutatesBudgets: false,
  enablesStorageV4Write: false,
  touchesDefaultDatabase: false,
  touchesProduction: false,
  restoreDatabaseCleanupAutomatic: false,
  steps: steps.map(({ name }) => name),
}, null, 2));

for (const step of steps) {
  console.log(`\n=== Phase K recovery: ${step.name} ===`);
  const args = [step.script];
  if (applyRequested) args.push('--apply');

  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`${step.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nPhase K recovery checkpoint completed. The restored database is intentionally preserved for inspection; its cleanup is a separate explicit action.');
