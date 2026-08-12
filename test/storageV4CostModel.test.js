import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStorageV4MonthlyCostScenarios,
  estimateStorageV4MonthlyCost,
  normalizeStorageV4PriceBook,
} from '../scripts/storageV4CostModel.mjs';

const capacity = Object.freeze({
  sessionsPerActiveUserPerDay: 1,
  firestoreReadsPerSession: 10,
  logicalMutationsPerSession: 2,
  firestoreWritesPerLogicalMutation: 1,
  firestoreDeletesPerSession: 0.1,
  functionInvocationsPerSession: 3,
  providerLookupsPerSession: 4,
  providerCacheHitRate: 0.75,
});

const prices = Object.freeze({
  daysPerMonth: 30,
  firestoreReadUsdPer100k: 1,
  firestoreWriteUsdPer100k: 2,
  firestoreDeleteUsdPer100k: 3,
  functionInvocationUsdPerMillion: 4,
  providerRequestUsdEach: 0.01,
  canonicalStorageGiBPerActiveUser: 0.001,
  canonicalStorageUsdPerGiBMonth: 0.1,
  pitrStorageGiBPerActiveUser: 0.001,
  pitrStorageUsdPerGiBMonth: 0.2,
  backupStorageGiBPerActiveUser: 0.002,
  backupStorageUsdPerGiBMonth: 0.03,
  objectStorageGiBPerActiveUser: 0.01,
  objectStorageUsdPerGiBMonth: 0.02,
});

test('price book no acepta defaults implícitos ni valores negativos', () => {
  assert.throws(() => normalizeStorageV4PriceBook({}), /daysPerMonth/);
  assert.throws(
    () => normalizeStorageV4PriceBook({ ...prices, firestoreReadUsdPer100k: -1 }),
    /firestoreReadUsdPer100k/
  );
});

test('monthly cost model escala operaciones, provider y storage explícitos', () => {
  const result = estimateStorageV4MonthlyCost(1000, capacity, prices);

  assert.equal(result.monthlyVolumes.firestoreReads, 300000);
  assert.equal(result.monthlyVolumes.firestoreWrites, 60000);
  assert.equal(result.monthlyVolumes.firestoreDeletes, 3000);
  assert.equal(result.monthlyVolumes.functionInvocations, 90000);
  assert.equal(result.monthlyVolumes.providerRequests, 30000);

  assert.deepEqual(result.operationCostsUsd, {
    firestoreReadsUsd: 3,
    firestoreWritesUsd: 1.2,
    firestoreDeletesUsd: 0.09,
    functionInvocationsUsd: 0.36,
    providerRequestsUsd: 300,
  });
  assert.deepEqual(result.storageVolumesGiB, {
    canonicalGiB: 1,
    pitrGiB: 1,
    backupGiB: 2,
    objectStorageGiB: 10,
  });
  assert.deepEqual(result.storageCostsUsd, {
    canonicalStorageUsd: 0.1,
    pitrStorageUsd: 0.2,
    backupStorageUsd: 0.06,
    objectStorageUsd: 0.2,
  });
  assert.equal(result.subtotalUsd, 305.21);
  assert.ok(result.exclusions.includes('Cloud Logging/Monitoring charges'));
});

test('cost scenarios conserva 1k/10k/50k/100k por default', () => {
  const scenarios = buildStorageV4MonthlyCostScenarios(capacity, prices);
  assert.deepEqual(
    scenarios.map((scenario) => scenario.activeUsers),
    [1000, 10000, 50000, 100000]
  );
  assert.equal(scenarios[1].subtotalUsd, scenarios[0].subtotalUsd * 10);
});
