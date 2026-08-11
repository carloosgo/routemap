export const STORAGE_V4_CAPACITY_SCENARIOS = Object.freeze([
  1_000,
  10_000,
  50_000,
  100_000,
]);

function finiteNonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${field} debe ser un número no negativo.`);
  }
  return number;
}

function fraction(value, field) {
  const number = finiteNonNegative(value, field);
  if (number > 1) throw new TypeError(`${field} debe estar entre 0 y 1.`);
  return number;
}

function roundVolume(value) {
  return Math.round(value);
}

export function normalizeStorageV4CapacityAssumptions(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Los supuestos de capacidad deben ser un objeto.');
  }
  return Object.freeze({
    sessionsPerActiveUserPerDay: finiteNonNegative(
      raw.sessionsPerActiveUserPerDay,
      'sessionsPerActiveUserPerDay'
    ),
    firestoreReadsPerSession: finiteNonNegative(
      raw.firestoreReadsPerSession,
      'firestoreReadsPerSession'
    ),
    logicalMutationsPerSession: finiteNonNegative(
      raw.logicalMutationsPerSession,
      'logicalMutationsPerSession'
    ),
    firestoreWritesPerLogicalMutation: finiteNonNegative(
      raw.firestoreWritesPerLogicalMutation,
      'firestoreWritesPerLogicalMutation'
    ),
    firestoreDeletesPerSession: finiteNonNegative(
      raw.firestoreDeletesPerSession,
      'firestoreDeletesPerSession'
    ),
    functionInvocationsPerSession: finiteNonNegative(
      raw.functionInvocationsPerSession,
      'functionInvocationsPerSession'
    ),
    providerLookupsPerSession: finiteNonNegative(
      raw.providerLookupsPerSession,
      'providerLookupsPerSession'
    ),
    providerCacheHitRate: fraction(raw.providerCacheHitRate, 'providerCacheHitRate'),
  });
}

export function estimateStorageV4DailyCapacity(activeUsers, rawAssumptions) {
  const users = finiteNonNegative(activeUsers, 'activeUsers');
  const assumptions = normalizeStorageV4CapacityAssumptions(rawAssumptions);
  const sessions = users * assumptions.sessionsPerActiveUserPerDay;
  const logicalMutations = sessions * assumptions.logicalMutationsPerSession;
  const providerLookups = sessions * assumptions.providerLookupsPerSession;

  return Object.freeze({
    activeUsers: roundVolume(users),
    sessions: roundVolume(sessions),
    firestoreReads: roundVolume(sessions * assumptions.firestoreReadsPerSession),
    logicalMutations: roundVolume(logicalMutations),
    firestoreWrites: roundVolume(
      logicalMutations * assumptions.firestoreWritesPerLogicalMutation
    ),
    firestoreDeletes: roundVolume(sessions * assumptions.firestoreDeletesPerSession),
    functionInvocations: roundVolume(
      sessions * assumptions.functionInvocationsPerSession
    ),
    providerLookups: roundVolume(providerLookups),
    providerCacheHits: roundVolume(providerLookups * assumptions.providerCacheHitRate),
    providerRequests: roundVolume(providerLookups * (1 - assumptions.providerCacheHitRate)),
  });
}

export function buildStorageV4CapacityScenarios(
  rawAssumptions,
  scenarios = STORAGE_V4_CAPACITY_SCENARIOS
) {
  if (!Array.isArray(scenarios) || !scenarios.length) {
    throw new TypeError('scenarios debe contener al menos un tamaño de población.');
  }
  return scenarios.map((activeUsers) =>
    estimateStorageV4DailyCapacity(activeUsers, rawAssumptions)
  );
}
