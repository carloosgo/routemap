/* global process */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';

export function cliCommandCandidates(name, {
  platform = process.platform,
  env = process.env,
} = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('name es obligatorio.');
  }
  if (platform !== 'win32') return Object.freeze([name]);

  const candidates = [`${name}.cmd`, `${name}.exe`, name];
  if (name === 'gcloud' && env?.LOCALAPPDATA) {
    candidates.push(join(env.LOCALAPPDATA, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return Object.freeze(candidates);
}

export function runCliProcess(executable, args = [], {
  platform = process.platform,
  env = process.env,
  spawn = spawnSync,
} = {}) {
  if (typeof executable !== 'string' || !executable.trim()) {
    throw new TypeError('executable es obligatorio.');
  }
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');

  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    const command = hasPath ? basename(executable) : executable;
    return spawn(env?.ComSpec || 'cmd.exe', ['/d', '/c', command, ...args], {
      ...options,
      ...(hasPath ? { cwd: dirname(executable) } : {}),
    });
  }
  return spawn(executable, args, options);
}

export function resolveCliCommand(name, {
  platform = process.platform,
  env = process.env,
  spawn = spawnSync,
  exists = existsSync,
  probeArgs = ['--version'],
} = {}) {
  for (const candidate of cliCommandCandidates(name, { platform, env })) {
    const hasPath = candidate.includes('\\') || candidate.includes('/');
    if (hasPath && !exists(candidate)) continue;
    const probe = runCliProcess(candidate, probeArgs, { platform, env, spawn });
    if (!probe?.error && probe?.status === 0) return candidate;
  }
  return null;
}
