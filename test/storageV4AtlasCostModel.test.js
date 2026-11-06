import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAtlasStorageV4MonthlyCostScenarios,
  estimateAtlasStorageV4MonthlyCost,
} from '../scripts/storageV4AtlasCostModel.mjs';

const capacity = Object.freeze({
  sessionsPerActiveUserPerDay: 1,
  firestoreReadsPerSession: 10,
  logicalMutationsPerSession: 2,
  firestoreWritesPerLogicalMutation: 1,
  firestoreDeletesPerSession: 0,
  functionInvocationsPerSession: 1,
  providerLookupsPerSession: 4,
  providerCacheHitRate: 0.75,
});

const prices = Object.freeze({
  daysPerMonth: 30,
  firestoreReadUsdPer100k: 0.03,
  firestoreWriteUsdPer100k: 0.09,
  firestoreDeleteUsdPer100k: 0.01,
  functionInvocationUsdPerMillion: 0.4,
  providerRequestUsdEach: 0,
  canonicalStorageGiBPerActiveUser: 0,
  canonicalStorageUsdPerGiBMonth: 0.15,
  pitrStorageGiBPerActiveUser: 0,
  pitrStorageUsdPerGiBMonth: 0.15,
  backupStorageGiBPerActiveUser: 0,
  backupStorageUsdPerGiBMonth: 0.03,
  objectStorageGiBPerActiveUser: 0,
  objectStorageUsdPerGiBMonth: 0,
});

test('Atlas evita doble conteo lineal de Geoapify', () => {
  assert.throws(
    () => estimateAtlasStorageV4MonthlyCost(1000, capacity, {
      ...prices,
      providerRequestUsdEach: 0.001,
    }),
    /providerRequestUsdEach debe ser 0/
  );
});

test('Atlas suma tier Geoapify al subtotal cuando el plan tiene precio fijo', () => {
  const result = estimateAtlasStorageV4MonthlyCost(10_000, capacity, prices);

  assert.equal(result.cloudModel.dailyCapacity.providerRequests, 10_000);
  assert.equal(result.geoapify.planName, 'API 10');
  assert.equal(result.geoapify.monthlyUsd, 59);
  assert.equal(
    result.subtotalUsd,
    Math.round((result.cloudAndLinearServicesSubtotalUsd + 59) * 1_000_000) / 1_000_000
  );
  assert.equal(result.customQuoteRequired, false);
});

test('Atlas no inventa total exacto cuando Geoapify requiere Custom', () => {
  const highProviderUsage = { ...capacity, providerLookupsPerSession: 4, providerCacheHitRate: 0 };
  const result = estimateAtlasStorageV4MonthlyCost(100_000, highProviderUsage, prices);

  assert.equal(result.cloudModel.dailyCapacity.providerRequests, 400_000);
  assert.equal(result.geoapify.planName, 'Custom');
  assert.equal(result.subtotalUsd, null);
  assert.ok(result.subtotalUsdFrom >= result.cloudAndLinearServicesSubtotalUsd + 860);
  assert.equal(result.customQuoteRequired, true);
});

test('escenarios Atlas conserva 1k/10k/50k/100k', () => {
  const scenarios = buildAtlasStorageV4MonthlyCostScenarios(capacity, prices);
  assert.deepEqual(scenarios.map((item) => item.activeUsers), [1000, 10000, 50000, 100000]);
});
