import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEV_APP_CHECK_CLIENT_CONFIRMATION,
  DEV_APP_CHECK_HOSTING_SITE,
  DEV_APP_CHECK_HOSTING_URL,
  inspectBuiltClient,
  parseDevAppCheckClientArgs,
} from '../scripts/runStorageV4DevAppCheckClientDeploy.mjs';

test('dev App Check client deploy is hard-bound and guarded for apply', () => {
  assert.equal(DEV_APP_CHECK_HOSTING_SITE, 'atlasmap-dev');
  assert.equal(DEV_APP_CHECK_HOSTING_URL, 'https://atlasmap-dev.web.app');
  assert.deepEqual(parseDevAppCheckClientArgs([]), { apply: false });
  assert.throws(() => parseDevAppCheckClientArgs(['--apply']), /exige --confirm/);
  assert.deepEqual(
    parseDevAppCheckClientArgs(['--apply', `--confirm=${DEV_APP_CHECK_CLIENT_CONFIRMATION}`]),
    { apply: true }
  );
  assert.throws(() => parseDevAppCheckClientArgs(['--project=atlasmap-prod']), /Argumento desconocido/);
});

test('bundle inspection requires site key, dev project and Maps App Check wiring and rejects production project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-appcheck-bundle-'));
  try {
    await mkdir(join(root, 'assets'));
    const siteKey = 'site-key-public-test';
    await writeFile(
      join(root, 'assets', 'app.js'),
      `const project='atlasmap-dev'; const appCheck='${siteKey}'; const wiring='fetchAppCheckToken';`,
      'utf8'
    );
    const valid = inspectBuiltClient(root, { siteKey });
    assert.equal(valid.valid, true);
    assert.equal(valid.siteKeyFound, true);
    assert.equal(valid.devProjectFound, true);
    assert.equal(valid.productionProjectFound, false);
    assert.equal(valid.mapsAppCheckTokenWiringFound, true);

    await writeFile(
      join(root, 'assets', 'bad.js'),
      "const accidental='atlasmap-prod';",
      'utf8'
    );
    const invalid = inspectBuiltClient(root, { siteKey });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.productionProjectFound, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('bundle inspection rejects an otherwise-correct client without Maps App Check wiring', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-appcheck-bundle-no-maps-'));
  try {
    await mkdir(join(root, 'assets'));
    const siteKey = 'site-key-public-test';
    await writeFile(
      join(root, 'assets', 'app.js'),
      `const project='atlasmap-dev'; const appCheck='${siteKey}';`,
      'utf8'
    );
    const invalid = inspectBuiltClient(root, { siteKey });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.siteKeyFound, true);
    assert.equal(invalid.devProjectFound, true);
    assert.equal(invalid.productionProjectFound, false);
    assert.equal(invalid.mapsAppCheckTokenWiringFound, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('client deploy contract keeps site key ephemeral and enforcement unchanged', async () => {
  const source = await readFile('scripts/runStorageV4DevAppCheckClientDeploy.mjs', 'utf8');
  assert.match(source, /writesSiteKeyToEnvironmentFile: false/);
  assert.match(source, /injectsFirebaseConfigOnlyIntoBuildProcess: true/);
  assert.match(source, /forcesFirebaseProjectToDev: true/);
  assert.match(source, /forcesFirebaseEmulatorsOff: true/);
  assert.match(source, /verifiesGoogleMapsAppCheckTokenWiring: true/);
  assert.match(source, /hostedGoogleMapsAppCheckTokenWiringVerified: true/);
  assert.match(source, /changesAppCheckEnforcement: false/);
  assert.match(source, /environmentFileMutated: false/);
  assert.match(source, /appCheckEnforcementChanged: false/);
  assert.match(source, /productionMutated: false/);
  assert.match(source, /site: DEV_APP_CHECK_HOSTING_SITE/);
  assert.match(source, /rewrites: \[\{ source: '\*\*', destination: '\/index\.html' \}\]/);
  assert.doesNotMatch(source, /atlasmap-prod[^'"\n]*deploy/);

  const directNode = source.indexOf('if (executable === process.execPath)');
  const cmdFallback = source.indexOf("if (process.platform === 'win32' && executable === 'gcloud.cmd')");
  assert.ok(directNode >= 0, 'Falta la rama explícita para process.execPath.');
  assert.ok(cmdFallback > directNode, 'La rama Node directa debe evaluarse antes del fallback gcloud.cmd.');
  assert.match(source, /return spawnSync\(process\.execPath, args, directOptions\);/);
  const cmdOptions = source.match(
    /return spawnSync\('cmd\.exe', \['\/d', '\/c', 'gcloud\.cmd', \.\.\.args\], \{([\s\S]*?)\}\);/
  );
  assert.ok(cmdOptions, 'Falta el bloque explícito y literal de gcloud.cmd.');
  assert.match(cmdOptions[1], /encoding: 'utf8'/);
  assert.match(cmdOptions[1], /windowsHide: true/);
  assert.match(cmdOptions[1], /stdio: 'pipe'/);
  assert.doesNotMatch(cmdOptions[1], /\b(?:cwd|env|directOptions)\b/);
  assert.doesNotMatch(source, /executable\.toLowerCase\(\)\.endsWith\('\.cmd'\)/);
});
