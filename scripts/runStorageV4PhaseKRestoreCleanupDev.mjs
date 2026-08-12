/* global process */
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const applyRequested = process.argv.slice(2).includes('--apply');
const script = join(here, 'storage-v4-phase-k-restore-cleanup-dev.ps1');
const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
if (applyRequested) args.push('-Apply');

const result = spawnSync('powershell.exe', args, {
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
