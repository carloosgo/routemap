import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const CITY_CATALOG_SCHEMA_VERSION = 1;
export const CITY_CATALOG_COLLECTIONS = Object.freeze({
  cities: 'cityCatalog',
  providerRefs: 'cityCatalogProviderRefs',
  queries: 'cityCatalogQueries',
});

const SUPPORTED_LANGUAGES = new Set(['es', 'en']);
const CITY_CATALOG_REVALIDATE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_RESULTS = 5;

function text(value, maxLength = 256) {
  return String(value || '').trim().slice(0, maxLength);
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function safeLanguage(value) {
  const language = text(value, 8).toLowerCase();
  return SUPPORTED_LANGUAGES.has(language) ? language : 'es';
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function countryCode(value) {
  const code = text(value, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function sanitizeSuggestion(result, { requireProviderId = false } = {}) {
  if (!result || typeof result !== 'object') return null;

  const providerId = text(result.id, 256);
  const name = text(result.name, 120);
  const country = text(result.country, 100);
  const code = countryCode(result.countryCode);
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (
    (requireProviderId && !providerId)
    || !name
    || !code
    || !validCoordinate(lat, -90, 90)
    || !validCoordinate(lon, -180, 180)
  ) {
    return null;
  }

  const displayName = text(
    result.displayName || [name, country].filter(Boolean).join(', '),
    200
  );

  return {
    id: providerId,
    name,
    displayName,
    region: text(result.region, 100),
    regionCode: text(result.regionCode, 24),
    country,
    countryCode: code,
    lat,
    lon,
  };
}

function sanitizeAttribution(value) {
  if (!value || typeof value !== 'object') return null;
  const result = {
    dataSource: text(value.dataSource, 120),
    attribution: text(value.attribution, 500),
    license: text(value.license, 160),
    url: text(value.url, 500),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

function localizedMap(existing, language, value, maxLength) {
  const map = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...existing }
    : {};
  const clean = text(value, maxLength);
  if (clean) map[language] = clean;
  return map;
}

function atlasSuggestion(cityId, providerSuggestion) {
  return {
    ...providerSuggestion,
    id: cityId,
  };
}

export function cityCatalogQueryDocumentId(queryKey, language = 'es') {
  const safeQuery = text(queryKey, 160).toLowerCase();
  const locale = safeLanguage(language);
  return digest(`city-catalog-query:v${CITY_CATALOG_SCHEMA_VERSION}:${locale}:${safeQuery}`);
}

export function cityCatalogProviderRefDocumentId(provider, providerId) {
  return digest(
    `city-catalog-provider:v${CITY_CATALOG_SCHEMA_VERSION}:${text(provider, 40).toLowerCase()}:${text(providerId, 256)}`
  );
}

export function evaluateCityCatalogProjection(
  data,
  { nowMs = Date.now(), limit = MAX_RESULTS } = {}
) {
  if (!data || Number(data.schemaVersion) !== CITY_CATALOG_SCHEMA_VERSION) {
    return { status: 'miss', results: [] };
  }

  const results = [];
  for (const candidate of Array.isArray(data.results) ? data.results : []) {
    const city = sanitizeSuggestion(candidate);
    if (!city?.id) continue;
    results.push(city);
    if (results.length >= Math.min(Math.max(Number(limit) || MAX_RESULTS, 1), MAX_RESULTS)) {
      break;
    }
  }

  if (results.length === 0) return { status: 'miss', results: [] };
  const fresh = timestampMillis(data.revalidateAfter) > nowMs;
  return { status: fresh ? 'fresh' : 'stale', results };
}

export async function readCityCatalogQuery(
  db,
  { queryKey, language = 'es', limit = MAX_RESULTS, nowMs = Date.now() } = {}
) {
  const ref = db.collection(CITY_CATALOG_COLLECTIONS.queries)
    .doc(cityCatalogQueryDocumentId(queryKey, language));
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 'miss', results: [] };
  return evaluateCityCatalogProjection(snapshot.data(), { nowMs, limit });
}

async function upsertProviderCity(
  db,
  {
    provider = 'geoapify',
    providerSuggestion,
    language = 'es',
    attribution = null,
  }
) {
  const suggestion = sanitizeSuggestion(providerSuggestion, { requireProviderId: true });
  if (!suggestion) return null;

  const locale = safeLanguage(language);
  const providerId = suggestion.id;
  const providerRef = db.collection(CITY_CATALOG_COLLECTIONS.providerRefs)
    .doc(cityCatalogProviderRefDocumentId(provider, providerId));
  const proposedCityRef = db.collection(CITY_CATALOG_COLLECTIONS.cities).doc();

  return db.runTransaction(async (transaction) => {
    const providerRefSnapshot = await transaction.get(providerRef);
    const mappedCityId = text(providerRefSnapshot.data()?.cityId, 128);
    const cityRef = mappedCityId
      ? db.collection(CITY_CATALOG_COLLECTIONS.cities).doc(mappedCityId)
      : proposedCityRef;
    const citySnapshot = mappedCityId ? await transaction.get(cityRef) : null;
    const existing = citySnapshot?.exists ? citySnapshot.data() : {};
    const sourceAttribution = {
      ...(existing?.sourceAttribution && typeof existing.sourceAttribution === 'object'
        ? existing.sourceAttribution
        : {}),
    };
    const cleanAttribution = sanitizeAttribution(attribution);
    if (cleanAttribution) sourceAttribution[provider] = cleanAttribution;

    const payload = {
      schemaVersion: CITY_CATALOG_SCHEMA_VERSION,
      id: cityRef.id,
      status: 'active',
      defaultName: text(existing?.defaultName || suggestion.name, 120),
      names: localizedMap(existing?.names, locale, suggestion.name, 120),
      countryCode: suggestion.countryCode,
      countryNames: localizedMap(existing?.countryNames, locale, suggestion.country, 100),
      region: {
        name: suggestion.region || text(existing?.region?.name, 100),
        code: suggestion.regionCode || text(existing?.region?.code, 24),
      },
      lat: suggestion.lat,
      lon: suggestion.lon,
      providerRefs: {
        ...(existing?.providerRefs && typeof existing.providerRefs === 'object'
          ? existing.providerRefs
          : {}),
        [provider]: providerId,
      },
      sourceAttribution,
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!citySnapshot?.exists) payload.createdAt = FieldValue.serverTimestamp();

    transaction.set(cityRef, payload, { merge: true });
    transaction.set(providerRef, {
      schemaVersion: CITY_CATALOG_SCHEMA_VERSION,
      provider,
      providerId,
      cityId: cityRef.id,
      updatedAt: FieldValue.serverTimestamp(),
      ...(providerRefSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    return atlasSuggestion(cityRef.id, suggestion);
  });
}

export async function persistCityCatalogQuery(
  db,
  {
    queryKey,
    language = 'es',
    provider = 'geoapify',
    providerResults = [],
    attributionByProviderId = {},
    nowMs = Date.now(),
  } = {}
) {
  const locale = safeLanguage(language);
  const sourceResults = Array.isArray(providerResults)
    ? providerResults.slice(0, MAX_RESULTS)
    : [];
  if (sourceResults.length === 0) return [];

  const atlasResults = await Promise.all(
    sourceResults.map((result) => upsertProviderCity(db, {
      provider,
      providerSuggestion: result,
      language: locale,
      attribution: attributionByProviderId?.[result?.id] || null,
    }))
  );
  const validResults = atlasResults.filter(Boolean);
  if (validResults.length === 0) return [];

  const queryRef = db.collection(CITY_CATALOG_COLLECTIONS.queries)
    .doc(cityCatalogQueryDocumentId(queryKey, locale));
  await queryRef.set({
    schemaVersion: CITY_CATALOG_SCHEMA_VERSION,
    language: locale,
    provider,
    resultCount: validResults.length,
    results: validResults,
    verifiedAt: FieldValue.serverTimestamp(),
    revalidateAfter: Timestamp.fromMillis(nowMs + CITY_CATALOG_REVALIDATE_MS),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return validResults;
}
