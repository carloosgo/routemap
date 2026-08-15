import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const clientPath = fileURLToPath(new URL('../src/infrastructure/firebase/firebaseClient.js', import.meta.url));
const configPath = fileURLToPath(new URL('../src/config.js', import.meta.url));
const callablePolicyPath = fileURLToPath(new URL('../functions/callablePolicy.js', import.meta.url));

const clientSource = readFileSync(clientPath, 'utf8');
const configSource = readFileSync(configPath, 'utf8');
const callablePolicySource = readFileSync(callablePolicyPath, 'utf8');

test('App Check web wiring usa reCAPTCHA Enterprise y auto-refresh', () => {
  assert.match(clientSource, /initializeAppCheck/);
  assert.match(clientSource, /ReCaptchaEnterpriseProvider/);
  assert.match(clientSource, /isTokenAutoRefreshEnabled:\s*true/);
});

test('App Check cliente permanece dormido sin site key y en emuladores', () => {
  assert.match(clientSource, /config\.firebase\.useEmulators/);
  assert.match(clientSource, /!config\.firebase\.appCheckSiteKey/);
  assert.match(clientSource, /typeof window === 'undefined'/);
  assert.match(configSource, /VITE_FIREBASE_APPCHECK_SITE_KEY/);
});

test('App Check server-side permanece unenforced antes del gate L3', () => {
  assert.match(callablePolicySource, /ENFORCE_APP_CHECK/);
  assert.match(callablePolicySource, /default:\s*false/);
  assert.match(callablePolicySource, /enforceAppCheck:\s*false/);
});
