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

export function sanitizeCitySearchResults(
  results,
  { language = config.defaultLocale } = {}
) {
  const safeLanguage = normalizeLanguage(language);
  const requireLatinName = SUPPORTED_LANGUAGES.has(safeLanguage);

  return (Array.isArray(results) ? results : []).filter((result) => {
    if (!result || typeof result !== 'object') return false;
    const name = String(result.name || '').trim();
    if (!name) return false;
    return !requireLatinName || LATIN_NAME_PATTERN.test(name);
  });
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
