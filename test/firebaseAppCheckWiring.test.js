import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAppCheckEnforcementEnv } from '../functions/callablePolicy.js';

const clientPath = fileURLToPath(new URL('../src/infrastructure/firebase/firebaseClient.js', import.meta.url));
const configPath = fileURLToPath(new URL('../src/config.js', import.meta.url));
const mapsLoaderPath = fileURLToPath(new URL('../src/modules/map/googleMapsLoader.js', import.meta.url));
const callablePolicyPath = fileURLToPath(new URL('../functions/callablePolicy.js', import.meta.url));

const clientSource = readFileSync(clientPath, 'utf8');
const configSource = readFileSync(configPath, 'utf8');
const mapsLoaderSource = readFileSync(mapsLoaderPath, 'utf8');
const callablePolicySource = readFileSync(callablePolicyPath, 'utf8');

test('App Check web wiring usa reCAPTCHA Enterprise y auto-refresh', () => {
  assert.match(clientSource, /initializeAppCheck/);
  assert.match(clientSource, /ReCaptchaEnterpriseProvider/);
  assert.match(clientSource, /isTokenAutoRefreshEnabled:\s*true/);
  assert.match(clientSource, /export function getFirebaseAppCheck/);
  assert.match(clientSource, /appCheckInstance/);
});

test('App Check cliente permanece dormido sin site key y en emuladores', () => {
  assert.match(clientSource, /config\.firebase\.useEmulators/);
  assert.match(clientSource, /!config\.firebase\.appCheckSiteKey/);
  assert.match(clientSource, /typeof window === 'undefined'/);
  assert.match(configSource, /VITE_FIREBASE_APPCHECK_SITE_KEY/);
});

test('Google Maps JavaScript recibe tokens de la misma instancia App Check', () => {
  assert.match(mapsLoaderSource, /getFirebaseAppCheck/);
  assert.match(mapsLoaderSource, /getToken/);
  assert.match(mapsLoaderSource, /importLibrary\('core'\)/);
  assert.match(mapsLoaderSource, /Settings\.getInstance\(\)\.fetchAppCheckToken/);
  assert.match(mapsLoaderSource, /getToken\(appCheck, false\)/);
  assert.doesNotMatch(mapsLoaderSource, /getLimitedUseToken/);
});

test('App Check server-side conserva default fail-open con booleano compatible con firebase-functions v6', () => {
  assert.equal(parseAppCheckEnforcementEnv(undefined), false);
  assert.equal(parseAppCheckEnforcementEnv(''), false);
  assert.equal(parseAppCheckEnforcementEnv('false'), false);
  assert.equal(parseAppCheckEnforcementEnv('1'), false);
  assert.equal(parseAppCheckEnforcementEnv('yes'), false);
  assert.equal(parseAppCheckEnforcementEnv('true'), true);
  assert.equal(parseAppCheckEnforcementEnv(' TRUE '), true);

  assert.match(callablePolicySource, /process\.env\.ENFORCE_APP_CHECK/);
  assert.match(callablePolicySource, /parseAppCheckEnforcementEnv/);
  assert.doesNotMatch(callablePolicySource, /defineBoolean/);
  assert.match(callablePolicySource, /enforceAppCheck:\s*ENFORCE_APP_CHECK/);
  assert.match(callablePolicySource, /consumeAppCheckToken:\s*false/);
  assert.match(callablePolicySource, /delete safeOverrides\.enforceAppCheck/);
  assert.match(callablePolicySource, /delete safeOverrides\.consumeAppCheckToken/);
});
