/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(
  new URL('../scripts/runStorageV4PhaseL1ConfigureGoogleAuthProd.mjs', import.meta.url)
);
const source = readFileSync(scriptPath, 'utf8');

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('L1 Google Auth plan permanece sin mutaciones', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.phase, 'L1');
  assert.equal(value.mode, 'plan');
  assert.equal(value.project, 'atlasmap-prod');
  assert.equal(value.googleSignInOnly, true);
  assert.equal(value.supportEmailRequiredForApply, true);
  assert.equal(value.supportEmailProvided, false);
  assert.equal(value.emailPasswordEnabled, false);
  assert.equal(value.anonymousEnabled, false);
  assert.equal(value.phoneEnabled, false);
  assert.equal(value.addsLocalhostAuthorizedDomain, false);
  assert.equal(value.opensFirestoreRules, false);
  assert.equal(value.changesIam, false);
  assert.equal(value.deploysFunctions, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.mutatesApplicationData, false);
});

test('L1 Google Auth apply exige correo válido y token exacto', () => {
  const missingEmail = run([
    '--apply',
    '--confirm=ENABLE-ATLAS-V4-PROD-GOOGLE-AUTH',
  ]);
  assert.notEqual(missingEmail.status, 0);
  assert.match(missingEmail.stderr, /--support-email/);

  const badEmail = run([
    '--apply',
    '--support-email=not-an-email',
    '--confirm=ENABLE-ATLAS-V4-PROD-GOOGLE-AUTH',
  ]);
  assert.notEqual(badEmail.status, 0);
  assert.match(badEmail.stderr, /correo válido/);

  const wrongToken = run([
    '--apply',
    '--support-email=support@example.com',
    '--confirm=OTHER',
  ]);
  assert.notEqual(wrongToken.status, 0);
  assert.match(wrongToken.stderr, /ENABLE-ATLAS-V4-PROD-GOOGLE-AUTH/);
});

test('runner despliega solo auth y configura únicamente Google', () => {
  assert.match(source, /'--only', 'auth'/);
  assert.match(source, /anonymous: false/);
  assert.match(source, /emailPassword: false/);
  assert.match(source, /googleSignIn:/);
  assert.match(source, /oAuthBrandDisplayName: OAUTH_BRAND_DISPLAY_NAME/);
  assert.match(source, /supportEmail/);
  assert.doesNotMatch(source, /firebase deploy --only firestore/);
  assert.doesNotMatch(source, /'functions'/);
});

test('runner verifica seguridad antes y después del deploy', () => {
  const precheckIndex = source.indexOf('security-precheck-pass');
  const deployIndex = source.indexOf("'deploy',");
  const verifyIndex = source.indexOf('verifyAuth(token)');
  assert.ok(precheckIndex >= 0);
  assert.ok(deployIndex > precheckIndex);
  assert.ok(verifyIndex > deployIndex);
  assert.match(source, /assertLockedRules/);
  assert.match(source, /assertWebAppAndEmptyData/);
  assert.match(source, /defaultSupportedIdpConfigs\/google\.com/);
  assert.match(source, /config\?\.signIn\?\.email\?\.enabled === true/);
  assert.match(source, /config\?\.signIn\?\.anonymous\?\.enabled === true/);
  assert.match(source, /config\?\.signIn\?\.phoneNumber\?\.enabled === true/);
  assert.match(source, /domain === 'localhost'/);
});

test('runner no imprime soporte ni credenciales OAuth', () => {
  assert.match(source, /supportEmailPrinted: false/);
  assert.match(source, /oauthClientCredentialsPrinted: false/);
  assert.match(source, /clientCredentialsPrinted: false/);
});
