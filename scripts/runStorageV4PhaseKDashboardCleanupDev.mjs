/* global process, console */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'storage-v4-phase-k-dashboard-cleanup-dev.ps1');

function candidates() {
  if (process.platform !== 'win32') return ['pwsh', 'powershell'];
  const list = ['pwsh.exe', 'powershell.exe'];
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot) {
    list.unshift(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  }
  return list;
}

function resolvePowerShell() {
  for (const candidate of candidates()) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

const powershell = resolvePowerShell();
if (!powershell) {
  console.error('No se encontró PowerShell para el cleanup de dashboard de Phase K.');
  process.exit(1);
}

const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
if (process.argv.slice(2).includes('--apply')) args.push('-Apply');

const result = spawnSync(powershell, args, { stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
