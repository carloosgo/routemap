import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEV_APP_CHECK_METRIC_TYPE,
  DEV_APP_CHECK_METRICS_DEFAULT_MINUTES,
  DEV_APP_CHECK_METRICS_MAX_MINUTES,
  DEV_APP_CHECK_METRICS_PRODUCTION_PROJECT,
  DEV_APP_CHECK_METRICS_PROJECT,
  DEV_APP_CHECK_METRICS_SERVICES,
  parseDevAppCheckMetricsArgs,
} from '../scripts/runStorageV4DevAppCheckMetrics.mjs';

const source = readFileSync(resolve('scripts/runStorageV4DevAppCheckMetrics.mjs'), 'utf8');

test('App Check metrics checkpoint queda hard-bound a dev y a la métrica oficial', () => {
  assert.equal(DEV_APP_CHECK_METRICS_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_APP_CHECK_METRICS_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.equal(DEV_APP_CHECK_METRIC_TYPE, 'firebaseappcheck.googleapis.com/services/verification_count');
  assert.deepEqual(DEV_APP_CHECK_METRICS_SERVICES, [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'maps-backend.googleapis.com',
  ]);
});

test('ventana de observación es acotada y configurable', () => {
  assert.deepEqual(parseDevAppCheckMetricsArgs([]), { minutes: DEV_APP_CHECK_METRICS_DEFAULT_MINUTES });
  assert.deepEqual(parseDevAppCheckMetricsArgs(['--minutes=15']), { minutes: 15 });
  assert.throws(() => parseDevAppCheckMetricsArgs(['--minutes=0']), /entre 1/);
  assert.throws(
    () => parseDevAppCheckMetricsArgs([`--minutes=${DEV_APP_CHECK_METRICS_MAX_MINUTES + 1}`]),
    /entre 1/
  );
  assert.throws(() => parseDevAppCheckMetricsArgs(['--apply']), /Argumento desconocido/);
});

test('checkpoint sólo lee Monitoring y App Check; nunca decide enforcement automáticamente', () => {
  assert.match(source, /mode: 'read-only-app-check-metrics'/);
  assert.match(source, /automaticEnforcementDecision: false/);
  assert.match(source, /manualReviewRequiredBeforeEnforcement: true/);
  assert.match(source, /mutatesCloud: false/);
  assert.match(source, /changesEnforcement: false/);
  assert.match(source, /cloudChanged: false/);
  assert.match(source, /productionMutated: false/);
  assert.doesNotMatch(source, /method:\s*'PATCH'/);
  assert.doesNotMatch(source, /method:\s*'POST'/);
});

test('checkpoint conserva categorías de seguridad para evaluar tráfico real', () => {
  for (const category of [
    'VALID',
    'CONSUMED',
    'INVALID',
    'MISSING_OUTDATED_CLIENT',
    'MISSING_UNKNOWN_ORIGIN',
  ]) {
    assert.match(source, new RegExp(category));
  }
  assert.match(source, /verifiedPercent/);
  assert.match(source, /trafficObserved/);
});
