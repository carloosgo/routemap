import { config } from '../../config.js';
import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { cacheCities, getCachedCities } from './citySearchCache.js';

const SUPPORTED_LANGUAGES = new Set(['es', 'en']);

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
    if (cached) return cached;

    throwIfAborted(signal);
    const request = firebaseCallable('geoapifyCityAutocomplete');
    const response = await request({
      query: cleanQuery,
      language: safeLanguage,
      limit: safeLimit,
    });
    throwIfAborted(signal);

    const results = Array.isArray(response.data?.results)
      ? response.data.results
      : [];
    cacheCities(cacheKey, results);
    return results;
  }

  return { search };
}
