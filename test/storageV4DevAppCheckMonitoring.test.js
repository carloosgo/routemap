import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEV_APP_CHECK_MONITORING_CONFIRMATION,
  DEV_APP_CHECK_MONITORING_HOSTING_URL,
  DEV_APP_CHECK_MONITORING_PRODUCTION_PROJECT,
  DEV_APP_CHECK_MONITORING_PROJECT,
  DEV_APP_CHECK_MONITORING_SERVICES,
  parseDevAppCheckMonitoringArgs,
} from '../scripts/runStorageV4DevAppCheckMonitoring.mjs';

const source = readFileSync(resolve('scripts/runStorageV4DevAppCheckMonitoring.mjs'), 'utf8');

test('App Check monitoring runner queda hard-bound a dev', () => {
  assert.equal(DEV_APP_CHECK_MONITORING_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_APP_CHECK_MONITORING_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.equal(DEV_APP_CHECK_MONITORING_HOSTING_URL, 'https://atlasmap-dev.web.app');
  assert.deepEqual(DEV_APP_CHECK_MONITORING_SERVICES, [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'maps-backend.googleapis.com',
  ]);
});

test('apply exige confirmación explícita exacta', () => {
  assert.deepEqual(parseDevAppCheckMonitoringArgs([]), { apply: false });
  assert.throws(
    () => parseDevAppCheckMonitoringArgs(['--apply']),
    new RegExp(DEV_APP_CHECK_MONITORING_CONFIRMATION)
  );
  assert.deepEqual(
    parseDevAppCheckMonitoringArgs([
      '--apply',
      `--confirm=${DEV_APP_CHECK_MONITORING_CONFIRMATION}`,
    ]),
    { apply: true }
  );
});

test('runner configura monitoring-only y no ENFORCED ni replay protection', () => {
  assert.match(source, /targetMode: 'UNENFORCED'/);
  assert.match(source, /enforcementMode: 'UNENFORCED'/);
  assert.match(source, /updateMask: 'enforcementMode'/);
  assert.match(source, /replayProtection === 'OFF'/);
  assert.doesNotMatch(source, /enforcementMode:\s*'ENFORCED'/);
  assert.doesNotMatch(source, /replayProtection:\s*'UNENFORCED'/);
  assert.doesNotMatch(source, /replayProtection:\s*'ENFORCED'/);
});

test('Maps monitoring exige que Hosting ya tenga fetchAppCheckToken', () => {
  assert.match(source, /requiresHostedMapsAppCheckTokenWiring: true/);
  assert.match(source, /fetchAppCheckToken/);
  assert.match(source, /mapsAppCheckTokenCallbackObserved/);
  assert.match(source, /Hosting dev no evidencia fetchAppCheckToken/);
  assert.match(source, /hostedMapsAppCheckWiringVerified: true/);
});

test('runner aborta si baseline ya está ENFORCED', () => {
  assert.match(source, /service\.enforcementMode === 'ENFORCED'/);
  assert.match(source, /baseline ya está ENFORCED/);
});

test('runner no despliega cliente, funciones, rules ni cambia auth providers', () => {
  assert.match(source, /deploysClient: false/);
  assert.match(source, /deploysFunctions: false/);
  assert.match(source, /changesFirestoreRules: false/);
  assert.match(source, /changesAuthProviders: false/);
  assert.match(source, /touchesProduction: false/);
});
