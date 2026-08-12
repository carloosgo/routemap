import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEOAPIFY_PRICE_SNAPSHOT,
  estimateGeoapifyAutocompleteDailyCredits,
  selectGeoapifyPlanForAutocomplete,
} from '../scripts/geoapifyPlanModel.mjs';

test('snapshot Geoapify queda fechado y autocomplete consume 1 credito por request', () => {
  assert.equal(GEOAPIFY_PRICE_SNAPSHOT.asOf, '2026-08-12');
  assert.equal(GEOAPIFY_PRICE_SNAPSHOT.autocompleteCreditsPerRequest, 1);
  assert.equal(estimateGeoapifyAutocompleteDailyCredits(2500.2), 2501);
});

test('selector respeta fronteras publicadas de planes Geoapify', () => {
  assert.equal(selectGeoapifyPlanForAutocomplete(3000).planName, 'Free');
  assert.equal(selectGeoapifyPlanForAutocomplete(3001).planName, 'API 10');
  assert.equal(selectGeoapifyPlanForAutocomplete(10001).planName, 'API 25');
  assert.equal(selectGeoapifyPlanForAutocomplete(25001).planName, 'API 50');
  assert.equal(selectGeoapifyPlanForAutocomplete(50001).planName, 'API 100');
  assert.equal(selectGeoapifyPlanForAutocomplete(100001).planName, 'API 250');
});

test('volumen superior a API 250 no inventa precio fijo y exige cotizacion Custom', () => {
  const result = selectGeoapifyPlanForAutocomplete(250001);
  assert.equal(result.planName, 'Custom');
  assert.equal(result.monthlyUsd, null);
  assert.equal(result.monthlyUsdFrom, 860);
  assert.equal(result.customQuoteRequired, true);
});

test('selector rechaza volumen invalido', () => {
  assert.throws(() => selectGeoapifyPlanForAutocomplete(-1), /requestsPerDay/);
  assert.throws(() => selectGeoapifyPlanForAutocomplete(Number.NaN), /requestsPerDay/);
});
