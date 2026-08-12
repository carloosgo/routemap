/* global process, console */
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const applyRequested = process.argv.slice(2).includes('--apply');
const script = join(here, 'storage-v4-phase-k-restore-cleanup-dev.ps1');
const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
if (applyRequested) args.push('-Apply');

const candidates = process.platform === 'win32'
  ? ['pwsh.exe', 'powershell.exe']
  : ['pwsh', 'powershell'];

let lastNotFound = null;
for (const executable of candidates) {
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error?.code === 'ENOENT') {
    lastNotFound = result.error;
    continue;
  }

  if (result.error) {
    console.error(`${executable}: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

console.error(lastNotFound?.message || 'No se encontro pwsh/powershell para ejecutar el cleanup.');
process.exit(1);
