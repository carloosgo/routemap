/* global process, console */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'storage-v4-phase-k-restore-drill-dev.ps1');

function powershellCandidates() {
  if (process.platform !== 'win32') return ['pwsh', 'powershell'];
  const candidates = ['pwsh.exe', 'powershell.exe'];
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot) {
    candidates.unshift(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  }
  return candidates;
}

function resolvePowerShell() {
  for (const candidate of powershellCandidates()) {
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

function optionValue(name) {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

const powershell = resolvePowerShell();
if (!powershell) {
  console.error('No se encontró PowerShell ejecutable para el restore drill de Phase K.');
  process.exit(1);
}

const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
const cliArgs = process.argv.slice(2);
const sourceBackup = optionValue('--source-backup');
const destinationDatabase = optionValue('--destination-database');
if (sourceBackup) args.push('-SourceBackup', sourceBackup);
if (destinationDatabase) args.push('-DestinationDatabase', destinationDatabase);
if (cliArgs.includes('--apply')) args.push('-Apply');

const result = spawnSync(powershell, args, {
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
