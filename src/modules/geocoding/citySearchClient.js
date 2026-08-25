import { config } from '../../config.js';
import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { cacheCities, getCachedCities } from './citySearchCache.js';

const SUPPORTED_LANGUAGES = new Set(['es', 'en']);
const LATIN_NAME_PATTERN = /\p{Script=Latin}/u;

function normalizeQuery(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLanguage(value) {
  const language = String(value || '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.has(language) ? language : config.defaultLocale;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function cleanString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

// La búsqueda puede transportar metadatos de sugerencia (región, ranking, etc.),
// pero el City persistido mantiene exactamente el contrato canónico de Storage v4.
export function canonicalCityFromSearchResult(result) {
  return {
    id: cleanString(result?.id, 256),
    name: cleanString(result?.name, 120),
    displayName: cleanString(result?.displayName, 200),
    country: cleanString(result?.country, 100),
    countryCode: cleanString(result?.countryCode, 2).toUpperCase(),
    lat: Number(result?.lat),
    lon: Number(result?.lon),
  };
}

export function sanitizeCitySearchResults(
  results,
  { language = config.defaultLocale } = {}
) {
  const safeLanguage = normalizeLanguage(language);
  const requireLatinName = SUPPORTED_LANGUAGES.has(safeLanguage);
  const seenLabels = new Set();
  const sanitized = [];

  for (const result of Array.isArray(results) ? results : []) {
    if (!result || typeof result !== 'object') continue;
    const name = String(result.name || '').trim();
    if (!name || (requireLatinName && !LATIN_NAME_PATTERN.test(name))) continue;

    const displayName = String(result.displayName || '').trim();
    const fallbackLabel = [name, result.countryCode || result.country]
      .filter(Boolean)
      .join(', ');
    const labelKey = normalizeQuery(displayName || fallbackLabel);
    if (labelKey && seenLabels.has(labelKey)) continue;
    if (labelKey) seenLabels.add(labelKey);

    sanitized.push({
      ...result,
      region: cleanString(result.region, 100),
      regionCode: cleanString(result.regionCode, 24),
    });
  }

  return sanitized;
}

export function createGeoapifyCityProvider() {
  async function search(
    query,
    { signal, limit = config.citySearchLimit, language = config.defaultLocale } = {}
  ) {
    const cleanQuery = String(query || '').trim().slice(0, 120);
    const queryKey = normalizeQuery(cleanQuery);
    if (queryKey.length < config.citySearchMinChars) return [];

    const safeLimit = Math.min(Math.max(Number(limit) || config.citySearchLimit, 1), 5);
    const safeLanguage = normalizeLanguage(language);
    const cacheKey = `${queryKey}|${safeLanguage}|${safeLimit}`;
    const cached = getCachedCities(cacheKey, config.citySearchCacheTtlMs);
    if (cached) {
      const sanitized = sanitizeCitySearchResults(cached, { language: safeLanguage });
      if (sanitized.length !== cached.length) cacheCities(cacheKey, sanitized);
      return sanitized;
    }

    throwIfAborted(signal);
    const request = firebaseCallable('geoapifyCityAutocomplete');
    const response = await request({
      query: cleanQuery,
      language: safeLanguage,
      limit: safeLimit,
    });
    throwIfAborted(signal);

    const results = sanitizeCitySearchResults(response.data?.results, {
      language: safeLanguage,
    });
    cacheCities(cacheKey, results);
    return results;
  }

  return { search };
}
