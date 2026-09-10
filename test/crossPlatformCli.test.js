import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cliCommandCandidates,
  resolveCliCommand,
  runCliProcess,
} from '../scripts/crossPlatformCli.mjs';

test('Windows gcloud candidates include cmd and local Cloud SDK fallback', () => {
  const candidates = cliCommandCandidates('gcloud', {
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\Carlos\\AppData\\Local' },
  });

  assert.equal(candidates[0], 'gcloud.cmd');
  assert.equal(candidates[1], 'gcloud.exe');
  assert.equal(candidates[2], 'gcloud');
  assert.match(candidates[3], /Google[\\/]Cloud SDK[\\/]google-cloud-sdk[\\/]bin[\\/]gcloud\.cmd$/);
});

test('Windows cmd executables are launched through ComSpec instead of direct spawn', () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: 'ok', stderr: '' };
  };

  const result = runCliProcess('gcloud.cmd', ['auth', 'print-access-token'], {
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    spawn,
  });

  assert.equal(result.status, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(calls[0].args, ['/d', '/c', 'gcloud.cmd', 'auth', 'print-access-token']);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.stdio, 'pipe');
});

test('Windows full cmd paths execute from their directory to survive spaces in Cloud SDK path', () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: 'ok', stderr: '' };
  };
  const executable = 'C:\\Users\\Carlos\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';

  runCliProcess(executable, ['version'], {
    platform: 'win32',
    env: { ComSpec: 'cmd.exe' },
    spawn,
  });

  assert.equal(calls[0].command, 'cmd.exe');
  assert.deepEqual(calls[0].args, ['/d', '/c', 'gcloud.cmd', 'version']);
  assert.equal(calls[0].options.cwd, 'C:\\Users\\Carlos\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin');
});

test('resolver accepts a working gcloud.cmd through the shared Windows launcher', () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push({ command, args });
    return { status: 0, stdout: 'Google Cloud SDK', stderr: '' };
  };

  const resolved = resolveCliCommand('gcloud', {
    platform: 'win32',
    env: { ComSpec: 'cmd.exe' },
    spawn,
    exists: () => true,
  });

  assert.equal(resolved, 'gcloud.cmd');
  assert.deepEqual(calls[0], {
    command: 'cmd.exe',
    args: ['/d', '/c', 'gcloud.cmd', '--version'],
  });
});
