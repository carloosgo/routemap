import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PREPROD_PROJECT,
  PRODUCTION_PROJECT,
  deployCommand,
  spawnOptions,
  validateBuiltPreprodBundle,
  validatePreprodHostingConfig,
} from '../scripts/runPreprodHostingDeploy.mjs';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'atlas-preprod-hosting-'));
}

test('preprod hosting config queda fijada a dist y alias dev/prod correctos', async () => {
  const root = await tempDir();
  const firebaseConfigPath = join(root, 'firebase.json');
  const firebasercPath = join(root, '.firebaserc');
  await writeFile(firebaseConfigPath, JSON.stringify({
    hosting: {
      public: 'dist',
      rewrites: [{ source: '**', destination: '/index.html' }],
    },
  }));
  await writeFile(firebasercPath, JSON.stringify({
    projects: { dev: PREPROD_PROJECT, prod: PRODUCTION_PROJECT },
  }));

  await assert.doesNotReject(() => validatePreprodHostingConfig({
    firebaseConfigPath,
    firebasercPath,
  }));
});

test('bundle guard acepta atlasmap-dev y rechaza atlasmap-prod', async () => {
  const root = await tempDir();
  const distDir = join(root, 'dist');
  await mkdir(join(distDir, 'assets'), { recursive: true });
  await writeFile(join(distDir, 'index.html'), '<script src="/assets/app.js"></script>');
  await writeFile(join(distDir, 'assets', 'app.js'), `const project="${PREPROD_PROJECT}";`);
  await assert.doesNotReject(() => validateBuiltPreprodBundle({ distDir }));

  await writeFile(join(distDir, 'assets', 'app.js'), `const project="${PRODUCTION_PROJECT}";`);
  await assert.rejects(
    () => validateBuiltPreprodBundle({ distDir }),
    /ABORTADO: el bundle contiene atlasmap-prod/
  );
});

test('deploy command sólo publica Hosting en atlasmap-dev', () => {
  assert.deepEqual(deployCommand(), [
    'firebase',
    'deploy',
    '--only',
    'hosting',
    '--project',
    PREPROD_PROJECT,
    '--config',
    'firebase.json',
  ]);
});

test('Windows ejecuta npm.cmd y npx.cmd mediante shell para evitar spawnSync EINVAL', () => {
  assert.deepEqual(spawnOptions('win32'), { stdio: 'inherit', shell: true });
  assert.deepEqual(spawnOptions('linux'), { stdio: 'inherit', shell: false });
});
