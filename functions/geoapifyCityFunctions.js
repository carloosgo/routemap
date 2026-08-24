import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import {
  GEOAPIFY_CITY_API_KEY,
  QUOTAS,
  cached,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  normalized,
  requireGeoapifyKey,
} from './geoapifySupport.js';
import { normalizeGeoapifyCityResults } from './geoapifyCityUtils.js';

const MIN_QUERY_CHARS = 3;
const MAX_RESULTS = 5;
const MAX_PROVIDER_RESULTS = 10;
const MAX_QUERY_CHARS = 120;
const ALLOWED_LANGUAGES = new Set(['es', 'en']);

function requestedLimit(value) {
  return Math.min(Math.max(Number(value) || MAX_RESULTS, 1), MAX_RESULTS);
}

function requestedLanguage(value) {
  const language = String(value || '').trim().toLowerCase();
  return ALLOWED_LANGUAGES.has(language) ? language : 'es';
}

async function loadCities(query, limit, language) {
  // Pedimos candidatos extra porque OSM puede representar una misma ciudad
  // como nodo de centro y como boundary administrativa. Se deduplican después.
  const providerLimit = Math.min(Math.max(limit * 2, limit), MAX_PROVIDER_RESULTS);
  const params = new URLSearchParams({
    text: query,
    type: 'city',
    format: 'json',
    lang: language,
    limit: String(providerLimit),
    apiKey: requireGeoapifyKey(
      GEOAPIFY_CITY_API_KEY,
      'GEOAPIFY_CITY_API_KEY'
    ),
  });
  const payload = await limitedFetch(
    `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
  );

  return normalizeGeoapifyCityResults(payload.results, { language, limit });
}

export const geoapifyCityAutocomplete = onCall(
  callableOptions({
    secrets: [GEOAPIFY_CITY_API_KEY],
    enforceAppCheck: false,
  }),
  async (request) => {
    try {
      await enforceQuota(db, request, QUOTAS.cityAutocomplete);

      const query = String(request.data?.query || '').trim().slice(0, MAX_QUERY_CHARS);
      const queryKey = normalized(query);
      if (queryKey.length < MIN_QUERY_CHARS) {
        throw new HttpsError('invalid-argument', 'La ciudad requiere al menos 3 caracteres.');
      }

      const limit = requestedLimit(request.data?.limit);
      const language = requestedLanguage(request.data?.language);
      // v2 invalida respuestas previas que podían contener duplicados o nombres nativos.
      const key = `city:v2:${queryKey}:lang=${language}:limit=${limit}`;
      const cachedResult = await cached(
        'citySearchCache',
        key,
        () => loadCities(query, limit, language)
      );

      return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
    } catch (error) {
      logError('City autocomplete request failed.', {
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
        errorMessage: String(error?.message || error || 'Unknown error').slice(0, 240),
      });
      throw error;
    }
  }
);
