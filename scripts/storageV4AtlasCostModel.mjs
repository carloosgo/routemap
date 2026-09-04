import { selectGeoapifyPlanForAutocomplete } from './geoapifyPlanModel.mjs';
import {
  STORAGE_V4_CAPACITY_SCENARIOS,
} from './storageV4CapacityModel.mjs';
import {
  estimateStorageV4MonthlyCost,
} from './storageV4CostModel.mjs';

function assertAtlasPriceBook(priceBook) {
  if (!priceBook || typeof priceBook !== 'object' || Array.isArray(priceBook)) {
    throw new TypeError('priceBook debe ser un objeto.');
  }
  if (priceBook.providerRequestUsdEach !== 0) {
    throw new TypeError(
      'Atlas usa tiers Geoapify: providerRequestUsdEach debe ser 0 para evitar doble conteo.'
    );
  }
  return priceBook;
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function estimateAtlasStorageV4MonthlyCost(
  activeUsers,
  capacityAssumptions,
  priceBook
) {
  const validatedPriceBook = assertAtlasPriceBook(priceBook);
  const cloud = estimateStorageV4MonthlyCost(
    activeUsers,
    capacityAssumptions,
    validatedPriceBook
  );
  const geoapify = selectGeoapifyPlanForAutocomplete(cloud.dailyCapacity.providerRequests);

  const exactProviderMonthlyUsd = geoapify.monthlyUsd;
  const providerMonthlyUsdFrom = exactProviderMonthlyUsd ?? geoapify.monthlyUsdFrom;
  const subtotalUsd = exactProviderMonthlyUsd == null
    ? null
    : money(cloud.subtotalUsd + exactProviderMonthlyUsd);
  const subtotalUsdFrom = providerMonthlyUsdFrom == null
    ? null
    : money(cloud.subtotalUsd + providerMonthlyUsdFrom);

  return Object.freeze({
    activeUsers: cloud.activeUsers,
    cloudAndLinearServicesSubtotalUsd: cloud.subtotalUsd,
    geoapify,
    subtotalUsd,
    subtotalUsdFrom,
    customQuoteRequired: geoapify.customQuoteRequired,
    cloudModel: cloud,
    caveats: Object.freeze([
      'Geoapify se modela por tier mensual, no por costo lineal por request.',
      'El subtotal Cloud sigue excluyendo CPU/memoria/duración de Cloud Run, egress, Logging/Monitoring, impuestos y descuentos.',
      'No aplicar free tiers al forecast sin modelarlos explícitamente.',
      'Los supuestos de uso y almacenamiento deben provenir de medición o aprobación antes de tratar el resultado como forecast.',
    ]),
  });
}

export function buildAtlasStorageV4MonthlyCostScenarios(
  capacityAssumptions,
  priceBook,
  scenarios = STORAGE_V4_CAPACITY_SCENARIOS
) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new TypeError('scenarios debe contener al menos un tamaño de población.');
  }
  return scenarios.map((activeUsers) =>
    estimateAtlasStorageV4MonthlyCost(activeUsers, capacityAssumptions, priceBook)
  );
}
