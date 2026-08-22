import {
  STORAGE_V4_CAPACITY_SCENARIOS,
  estimateStorageV4DailyCapacity,
  normalizeStorageV4CapacityAssumptions,
} from './storageV4CapacityModel.mjs';

function finiteNonNegative(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} debe ser un número no negativo explícito.`);
  }
  return value;
}

function finitePositive(value, field) {
  const number = finiteNonNegative(value, field);
  if (number <= 0) throw new TypeError(`${field} debe ser mayor que cero.`);
  return number;
}

export function normalizeStorageV4PriceBook(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('priceBook debe ser un objeto.');
  }

  return Object.freeze({
    daysPerMonth: finitePositive(raw.daysPerMonth, 'daysPerMonth'),
    firestoreReadUsdPer100k: finiteNonNegative(
      raw.firestoreReadUsdPer100k,
      'firestoreReadUsdPer100k'
    ),
    firestoreWriteUsdPer100k: finiteNonNegative(
      raw.firestoreWriteUsdPer100k,
      'firestoreWriteUsdPer100k'
    ),
    firestoreDeleteUsdPer100k: finiteNonNegative(
      raw.firestoreDeleteUsdPer100k,
      'firestoreDeleteUsdPer100k'
    ),
    functionInvocationUsdPerMillion: finiteNonNegative(
      raw.functionInvocationUsdPerMillion,
      'functionInvocationUsdPerMillion'
    ),
    providerRequestUsdEach: finiteNonNegative(
      raw.providerRequestUsdEach,
      'providerRequestUsdEach'
    ),
    canonicalStorageGiBPerActiveUser: finiteNonNegative(
      raw.canonicalStorageGiBPerActiveUser,
      'canonicalStorageGiBPerActiveUser'
    ),
    canonicalStorageUsdPerGiBMonth: finiteNonNegative(
      raw.canonicalStorageUsdPerGiBMonth,
      'canonicalStorageUsdPerGiBMonth'
    ),
    pitrStorageGiBPerActiveUser: finiteNonNegative(
      raw.pitrStorageGiBPerActiveUser,
      'pitrStorageGiBPerActiveUser'
    ),
    pitrStorageUsdPerGiBMonth: finiteNonNegative(
      raw.pitrStorageUsdPerGiBMonth,
      'pitrStorageUsdPerGiBMonth'
    ),
    backupStorageGiBPerActiveUser: finiteNonNegative(
      raw.backupStorageGiBPerActiveUser,
      'backupStorageGiBPerActiveUser'
    ),
    backupStorageUsdPerGiBMonth: finiteNonNegative(
      raw.backupStorageUsdPerGiBMonth,
      'backupStorageUsdPerGiBMonth'
    ),
    objectStorageGiBPerActiveUser: finiteNonNegative(
      raw.objectStorageGiBPerActiveUser,
      'objectStorageGiBPerActiveUser'
    ),
    objectStorageUsdPerGiBMonth: finiteNonNegative(
      raw.objectStorageUsdPerGiBMonth,
      'objectStorageUsdPerGiBMonth'
    ),
  });
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function operationCost(volume, unitSize, unitPrice) {
  return (volume / unitSize) * unitPrice;
}

export function estimateStorageV4MonthlyCost(
  activeUsers,
  rawCapacityAssumptions,
  rawPriceBook
) {
  const assumptions = normalizeStorageV4CapacityAssumptions(rawCapacityAssumptions);
  const priceBook = normalizeStorageV4PriceBook(rawPriceBook);
  const daily = estimateStorageV4DailyCapacity(activeUsers, assumptions);
  const days = priceBook.daysPerMonth;

  const monthly = Object.freeze({
    firestoreReads: daily.firestoreReads * days,
    firestoreWrites: daily.firestoreWrites * days,
    firestoreDeletes: daily.firestoreDeletes * days,
    functionInvocations: daily.functionInvocations * days,
    providerRequests: daily.providerRequests * days,
  });

  const operationCosts = Object.freeze({
    firestoreReadsUsd: money(operationCost(
      monthly.firestoreReads,
      100_000,
      priceBook.firestoreReadUsdPer100k
    )),
    firestoreWritesUsd: money(operationCost(
      monthly.firestoreWrites,
      100_000,
      priceBook.firestoreWriteUsdPer100k
    )),
    firestoreDeletesUsd: money(operationCost(
      monthly.firestoreDeletes,
      100_000,
      priceBook.firestoreDeleteUsdPer100k
    )),
    functionInvocationsUsd: money(operationCost(
      monthly.functionInvocations,
      1_000_000,
      priceBook.functionInvocationUsdPerMillion
    )),
    providerRequestsUsd: money(
      monthly.providerRequests * priceBook.providerRequestUsdEach
    ),
  });

  const storageVolumes = Object.freeze({
    canonicalGiB: activeUsers * priceBook.canonicalStorageGiBPerActiveUser,
    pitrGiB: activeUsers * priceBook.pitrStorageGiBPerActiveUser,
    backupGiB: activeUsers * priceBook.backupStorageGiBPerActiveUser,
    objectStorageGiB: activeUsers * priceBook.objectStorageGiBPerActiveUser,
  });

  const storageCosts = Object.freeze({
    canonicalStorageUsd: money(
      storageVolumes.canonicalGiB * priceBook.canonicalStorageUsdPerGiBMonth
    ),
    pitrStorageUsd: money(
      storageVolumes.pitrGiB * priceBook.pitrStorageUsdPerGiBMonth
    ),
    backupStorageUsd: money(
      storageVolumes.backupGiB * priceBook.backupStorageUsdPerGiBMonth
    ),
    objectStorageUsd: money(
      storageVolumes.objectStorageGiB * priceBook.objectStorageUsdPerGiBMonth
    ),
  });

  const subtotalUsd = money(
    Object.values(operationCosts).reduce((sum, value) => sum + value, 0)
      + Object.values(storageCosts).reduce((sum, value) => sum + value, 0)
  );

  return Object.freeze({
    activeUsers: daily.activeUsers,
    daysPerMonth: days,
    dailyCapacity: daily,
    monthlyVolumes: monthly,
    storageVolumesGiB: storageVolumes,
    operationCostsUsd: operationCosts,
    storageCostsUsd: storageCosts,
    subtotalUsd,
    exclusions: Object.freeze([
      'free-tier credits/allowances',
      'egress',
      'Cloud Run CPU/memory duration',
      'Cloud Logging/Monitoring charges',
      'email/AI/other provider charges not represented by providerRequestUsdEach',
      'taxes and negotiated discounts',
    ]),
  });
}

export function buildStorageV4MonthlyCostScenarios(
  rawCapacityAssumptions,
  rawPriceBook,
  scenarios = STORAGE_V4_CAPACITY_SCENARIOS
) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new TypeError('scenarios debe contener al menos un tamaño de población.');
  }
  return scenarios.map((activeUsers) =>
    estimateStorageV4MonthlyCost(activeUsers, rawCapacityAssumptions, rawPriceBook)
  );
}
