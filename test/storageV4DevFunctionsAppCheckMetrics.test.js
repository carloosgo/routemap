import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEV_FUNCTIONS_APP_CHECK_DEFAULT_LIMIT,
  DEV_FUNCTIONS_APP_CHECK_DEFAULT_MINUTES,
  DEV_FUNCTIONS_APP_CHECK_LOG_TYPE,
  DEV_FUNCTIONS_APP_CHECK_PRODUCTION_PROJECT,
  DEV_FUNCTIONS_APP_CHECK_PROJECT,
  parseDevFunctionsAppCheckMetricsArgs,
  summarizeCallableVerificationEntries,
} from '../scripts/runStorageV4DevFunctionsAppCheckMetrics.mjs';

const source = readFileSync(resolve('scripts/runStorageV4DevFunctionsAppCheckMetrics.mjs'), 'utf8');

test('checkpoint de Functions App Check queda read-only y hard-bound a dev', () => {
  assert.equal(DEV_FUNCTIONS_APP_CHECK_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_FUNCTIONS_APP_CHECK_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.equal(DEV_FUNCTIONS_APP_CHECK_LOG_TYPE, 'callable-request-verification');
  assert.match(source, /mode: 'read-only-callable-app-check-logs'/);
  assert.match(source, /mutatesCloud: false/);
  assert.match(source, /deploysFunctions: false/);
  assert.match(source, /changesAppCheckEnforcement: false/);
  assert.match(source, /cloudChanged: false/);
  assert.match(source, /productionMutated: false/);
  assert.doesNotMatch(source, /--apply/);
});

test('ventana y límite son configurables pero acotados', () => {
  assert.deepEqual(parseDevFunctionsAppCheckMetricsArgs([]), {
    minutes: DEV_FUNCTIONS_APP_CHECK_DEFAULT_MINUTES,
    limit: DEV_FUNCTIONS_APP_CHECK_DEFAULT_LIMIT,
  });
  assert.deepEqual(parseDevFunctionsAppCheckMetricsArgs(['--minutes=30', '--limit=500']), {
    minutes: 30,
    limit: 500,
  });
  assert.throws(() => parseDevFunctionsAppCheckMetricsArgs(['--minutes=0']), /entre 1/);
  assert.throws(() => parseDevFunctionsAppCheckMetricsArgs(['--limit=0']), /entre 1/);
  assert.throws(() => parseDevFunctionsAppCheckMetricsArgs(['--apply']), /Argumento desconocido/);
});

test('agregación acepta app o appCheck y separa VALID INVALID MISSING', () => {
  const entries = [
    {
      labels: { 'firebase-log-type': DEV_FUNCTIONS_APP_CHECK_LOG_TYPE },
      resource: { type: 'cloud_run_revision', labels: { service_name: 'geoapifyCityAutocomplete' } },
      jsonPayload: { verifications: { app: 'VALID' } },
    },
    {
      labels: { 'firebase-log-type': DEV_FUNCTIONS_APP_CHECK_LOG_TYPE },
      resource: { type: 'cloud_run_revision', labels: { service_name: 'geoapifyCityAutocomplete' } },
      jsonPayload: { verifications: { appCheck: 'MISSING' } },
    },
    {
      labels: { 'firebase-log-type': DEV_FUNCTIONS_APP_CHECK_LOG_TYPE },
      resource: { type: 'cloud_function', labels: { function_name: 'googlePlaceSearch' } },
      jsonPayload: { verifications: { app: 'INVALID' } },
    },
  ];

  const summary = summarizeCallableVerificationEntries(entries);
  assert.equal(summary.totals.total, 3);
  assert.equal(summary.totals.VALID, 1);
  assert.equal(summary.totals.INVALID, 1);
  assert.equal(summary.totals.MISSING, 1);
  assert.deepEqual(summary.resourceTypes, ['cloud_function', 'cloud_run_revision']);

  const city = summary.functions.find((item) => item.functionName === 'geoapifyCityAutocomplete');
  assert.equal(city.total, 2);
  assert.equal(city.counts.VALID, 1);
  assert.equal(city.counts.MISSING, 1);
  assert.equal(city.validPercent, 50);
  assert.equal(city.expectedCallable, true);
});

test('checkpoint conserva revisión manual antes de enforcement', () => {
  assert.match(source, /automaticEnforcementDecision: false/);
  assert.match(source, /manualReviewRequiredBeforeFunctionsEnforcement: true/);
  assert.match(source, /expectedCallablesWithoutTraffic/);
  assert.match(source, /truncationPossible/);
});
