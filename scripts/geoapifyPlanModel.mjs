const OFFICIAL_PRICING_URL = 'https://www.geoapify.com/pricing/';
const OFFICIAL_AUTOCOMPLETE_DOCS_URL = 'https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/';

export const GEOAPIFY_PRICE_SNAPSHOT = Object.freeze({
  asOf: '2026-08-12',
  currency: 'USD',
  pricingUrl: OFFICIAL_PRICING_URL,
  autocompletePricingUrl: OFFICIAL_AUTOCOMPLETE_DOCS_URL,
  autocompleteCreditsPerRequest: 1,
  plans: Object.freeze([
    Object.freeze({ name: 'Free', dailyCredits: 3_000, monthlyUsd: 0 }),
    Object.freeze({ name: 'API 10', dailyCredits: 10_000, monthlyUsd: 59 }),
    Object.freeze({ name: 'API 25', dailyCredits: 25_000, monthlyUsd: 109 }),
    Object.freeze({ name: 'API 50', dailyCredits: 50_000, monthlyUsd: 179 }),
    Object.freeze({ name: 'API 100', dailyCredits: 100_000, monthlyUsd: 299 }),
    Object.freeze({ name: 'API 250', dailyCredits: 250_000, monthlyUsd: 609 }),
    Object.freeze({ name: 'Custom', dailyCredits: Number.POSITIVE_INFINITY, monthlyUsdFrom: 860 }),
  ]),
});

function finiteNonNegative(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} debe ser un número no negativo explícito.`);
  }
  return value;
}

export function estimateGeoapifyAutocompleteDailyCredits(requestsPerDay) {
  const requests = finiteNonNegative(requestsPerDay, 'requestsPerDay');
  return Math.ceil(requests * GEOAPIFY_PRICE_SNAPSHOT.autocompleteCreditsPerRequest);
}

export function selectGeoapifyPlanForAutocomplete(requestsPerDay) {
  const requests = finiteNonNegative(requestsPerDay, 'requestsPerDay');
  const dailyCredits = estimateGeoapifyAutocompleteDailyCredits(requests);
  const plan = GEOAPIFY_PRICE_SNAPSHOT.plans.find(
    (candidate) => dailyCredits <= candidate.dailyCredits
  );

  if (!plan) throw new Error('No se pudo seleccionar un plan Geoapify.');

  return Object.freeze({
    asOf: GEOAPIFY_PRICE_SNAPSHOT.asOf,
    currency: GEOAPIFY_PRICE_SNAPSHOT.currency,
    requestsPerDay: Math.ceil(requests),
    dailyCredits,
    planName: plan.name,
    planDailyCredits: Number.isFinite(plan.dailyCredits) ? plan.dailyCredits : null,
    monthlyUsd: Number.isFinite(plan.monthlyUsd) ? plan.monthlyUsd : null,
    monthlyUsdFrom: Number.isFinite(plan.monthlyUsdFrom) ? plan.monthlyUsdFrom : null,
    customQuoteRequired: plan.name === 'Custom',
    sourceUrls: Object.freeze([
      GEOAPIFY_PRICE_SNAPSHOT.pricingUrl,
      GEOAPIFY_PRICE_SNAPSHOT.autocompletePricingUrl,
    ]),
  });
}
