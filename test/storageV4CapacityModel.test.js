import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_V4_CAPACITY_SCENARIOS,
  buildStorageV4CapacityScenarios,
  estimateStorageV4DailyCapacity,
} from '../scripts/storageV4CapacityModel.mjs';

const assumptions = Object.freeze({
  sessionsPerActiveUserPerDay: 2,
  firestoreReadsPerSession: 10,
  logicalMutationsPerSession: 4,
  firestoreWritesPerLogicalMutation: 1,
  firestoreDeletesPerSession: 0.1,
  functionInvocationsPerSession: 3,
  providerLookupsPerSession: 5,
  providerCacheHitRate: 0.8,
});

test('capacity model escala linealmente sin incrustar precios', () => {
  const result = estimateStorageV4DailyCapacity(1000, assumptions);
  assert.deepEqual(result, {
    activeUsers: 1000,
    sessions: 2000,
    firestoreReads: 20000,
    logicalMutations: 8000,
    firestoreWrites: 8000,
    firestoreDeletes: 200,
    functionInvocations: 6000,
    providerLookups: 10000,
    providerCacheHits: 8000,
    providerRequests: 2000,
  });
  assert.equal(Object.hasOwn(result, 'cost'), false);
  assert.equal(Object.hasOwn(result, 'price'), false);
});

test('capacity model construye los cuatro escenarios requeridos', () => {
  const rows = buildStorageV4CapacityScenarios(assumptions);
  assert.deepEqual(rows.map((row) => row.activeUsers), STORAGE_V4_CAPACITY_SCENARIOS);
  assert.equal(rows[3].firestoreWrites, rows[0].firestoreWrites * 100);
});

test('capacity model exige cache hit rate entre cero y uno', () => {
  assert.throws(
    () => estimateStorageV4DailyCapacity(1000, {
      ...assumptions,
      providerCacheHitRate: 1.1,
    }),
    /providerCacheHitRate/
  );
});

test('capacity model no acepta supuestos faltantes o negativos de forma silenciosa', () => {
  assert.throws(
    () => estimateStorageV4DailyCapacity(1000, {}),
    /sessionsPerActiveUserPerDay/
  );
  assert.throws(
    () => estimateStorageV4DailyCapacity(1000, {
      ...assumptions,
      logicalMutationsPerSession: -1,
    }),
    /logicalMutationsPerSession/
  );
});
