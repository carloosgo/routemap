import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEV_APP_CHECK_CONFIRMATION,
  DEV_APP_CHECK_HOST,
  DEV_APP_CHECK_KEY_DISPLAY_NAME,
  DEV_APP_CHECK_PRODUCTION_PROJECT,
  DEV_APP_CHECK_PROJECT,
  DEV_APP_CHECK_TOKEN_TTL,
  DEV_APP_CHECK_WEB_APP_DISPLAY_NAME,
  assessDevRecaptchaKey,
  parseDevAppCheckBootstrapArgs,
} from '../scripts/runStorageV4DevAppCheckBootstrap.mjs';

test('dev App Check bootstrap is hard-bound and apply requires explicit confirmation', () => {
  assert.equal(DEV_APP_CHECK_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_APP_CHECK_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.equal(DEV_APP_CHECK_WEB_APP_DISPLAY_NAME, 'atlas web dev');
  assert.equal(DEV_APP_CHECK_HOST, 'atlasmap-dev.web.app');
  assert.equal(DEV_APP_CHECK_TOKEN_TTL, '3600s');
  assert.deepEqual(parseDevAppCheckBootstrapArgs([]), { apply: false });
  assert.throws(() => parseDevAppCheckBootstrapArgs(['--apply']), /exige --confirm/);
  assert.deepEqual(
    parseDevAppCheckBootstrapArgs(['--apply', `--confirm=${DEV_APP_CHECK_CONFIRMATION}`]),
    { apply: true }
  );
  assert.throws(() => parseDevAppCheckBootstrapArgs(['--project=atlasmap-prod']), /Argumento desconocido/);
});

test('reCAPTCHA Enterprise key baseline is SCORE and restricted to the dev Hosting domain', () => {
  const key = {
    name: 'projects/atlasmap-dev/keys/public-site-key-id',
    displayName: DEV_APP_CHECK_KEY_DISPLAY_NAME,
    webSettings: {
      integrationType: 'SCORE',
      allowAllDomains: false,
      allowAmpTraffic: false,
      allowedDomains: [DEV_APP_CHECK_HOST],
    },
  };
  const assessment = assessDevRecaptchaKey([key]);
  assert.equal(assessment.valid, true);
  assert.equal(assessment.existing, true);
  assert.equal(assessment.siteKey, 'public-site-key-id');
});

test('reCAPTCHA Enterprise baseline fails closed on broad domains, testing mode or duplicates', () => {
  const base = {
    name: 'projects/atlasmap-dev/keys/key-id',
    displayName: DEV_APP_CHECK_KEY_DISPLAY_NAME,
    webSettings: {
      integrationType: 'SCORE',
      allowAllDomains: false,
      allowAmpTraffic: false,
      allowedDomains: [DEV_APP_CHECK_HOST],
    },
  };
  assert.equal(assessDevRecaptchaKey([{ ...base, webSettings: { ...base.webSettings, allowAllDomains: true } }]).valid, false);
  assert.equal(assessDevRecaptchaKey([{ ...base, testingOptions: { testingScore: 0.9 } }]).valid, false);
  assert.equal(assessDevRecaptchaKey([base, { ...base, name: 'projects/atlasmap-dev/keys/other' }]).valid, false);
});

test('bootstrap never enables enforcement, deploys client or writes site key/environment files', async () => {
  const source = await readFile('scripts/runStorageV4DevAppCheckBootstrap.mjs', 'utf8');
  assert.match(source, /changesAppCheckEnforcement: false/);
  assert.match(source, /monitoringModeChanged: false/);
  assert.match(source, /deploysClient: false/);
  assert.match(source, /writesEnvironmentFiles: false/);
  assert.match(source, /printsSiteKeyValue: false/);
  assert.match(source, /registersDebugTokens: false/);
  assert.match(source, /touchesProduction: false/);
  assert.match(source, /integrationType: 'SCORE'/);
  assert.doesNotMatch(source, /enforcementMode:\s*'ENFORCED'/);
  assert.doesNotMatch(source, /enforcementMode:\s*'UNENFORCED'/);
  assert.doesNotMatch(source, /allowAllDomains:\s*true/);
  assert.doesNotMatch(source, /testingOptions:\s*\{/);
});
