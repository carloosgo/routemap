import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEV_APP_CHECK_ENFORCEMENT_CONFIRMATION,
  DEV_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT,
  DEV_APP_CHECK_ENFORCEMENT_PROJECT,
  DEV_APP_CHECK_ENFORCEMENT_SERVICES,
  DEV_APP_CHECK_ROLLBACK_CONFIRMATION,
  parseDevAppCheckEnforcementArgs,
} from '../scripts/runStorageV4DevAppCheckEnforcement.mjs';

const source = readFileSync(resolve('scripts/runStorageV4DevAppCheckEnforcement.mjs'), 'utf8');

test('enforcement runner queda hard-bound a dev y a los tres servicios observados', () => {
  assert.equal(DEV_APP_CHECK_ENFORCEMENT_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.deepEqual(DEV_APP_CHECK_ENFORCEMENT_SERVICES, [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'maps-backend.googleapis.com',
  ]);
});

test('enforcement apply exige confirmación exacta y acknowledgement de métricas', () => {
  assert.deepEqual(parseDevAppCheckEnforcementArgs([]), {
    apply: false,
    rollback: false,
    metricsReviewed: false,
  });
  assert.throws(
    () => parseDevAppCheckEnforcementArgs([
      '--apply',
      `--confirm=${DEV_APP_CHECK_ENFORCEMENT_CONFIRMATION}`,
    ]),
    /ack-metrics-reviewed/
  );
  assert.deepEqual(
    parseDevAppCheckEnforcementArgs([
      '--apply',
      '--ack-metrics-reviewed',
      `--confirm=${DEV_APP_CHECK_ENFORCEMENT_CONFIRMATION}`,
    ]),
    { apply: true, rollback: false, metricsReviewed: true }
  );
});

test('rollback usa confirmación distinta y no requiere acknowledgement de métricas', () => {
  assert.deepEqual(parseDevAppCheckEnforcementArgs(['--rollback']), {
    apply: false,
    rollback: true,
    metricsReviewed: false,
  });
  assert.deepEqual(
    parseDevAppCheckEnforcementArgs([
      '--rollback',
      '--apply',
      `--confirm=${DEV_APP_CHECK_ROLLBACK_CONFIRMATION}`,
    ]),
    { apply: true, rollback: true, metricsReviewed: false }
  );
  assert.throws(
    () => parseDevAppCheckEnforcementArgs([
      '--rollback',
      '--apply',
      '--ack-metrics-reviewed',
      `--confirm=${DEV_APP_CHECK_ROLLBACK_CONFIRMATION}`,
    ]),
    /no aplica al rollback/
  );
});

test('enforcement sólo parte de UNENFORCED, exige Maps wiring y mantiene replay OFF', () => {
  assert.match(source, /enforcement exige baseline UNENFORCED/);
  assert.match(source, /Hosting dev no evidencia fetchAppCheckToken/);
  assert.match(source, /replayProtection !== 'OFF'/);
  assert.match(source, /targetMode: rollback \? 'UNENFORCED' : 'ENFORCED'/);
  assert.match(source, /updateMask: 'enforcementMode'/);
});

test('runner no toca funciones, rules, auth providers ni producción', () => {
  assert.match(source, /changesFunctionsEnforcement: false/);
  assert.match(source, /changesFirestoreRules: false/);
  assert.match(source, /changesAuthProviders: false/);
  assert.match(source, /touchesProduction: false/);
  assert.match(source, /functionsEnforcementChanged: false/);
  assert.match(source, /productionMutated: false/);
});
