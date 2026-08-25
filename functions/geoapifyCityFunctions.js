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
import {
  buildGeoapifyCitySearchUrl,
  normalizeGeoapifyCityResults,
} from './geoapifyCityUtils.js';

const MIN_QUERY_CHARS = 3;
const MAX_RESULTS = 5;
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
  const apiKey = requireGeoapifyKey(
    GEOAPIFY_CITY_API_KEY,
    'GEOAPIFY_CITY_API_KEY'
  );
  const payload = await limitedFetch(
    buildGeoapifyCitySearchUrl({ query, limit, language, apiKey })
  );

  return normalizeGeoapifyCityResults(payload.results, {
    language,
    limit,
    query,
    includeRegionMetadata: true,
  });
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
      // v6 invalida las respuestas generadas con Address Autocomplete y la
      // identidad visible v5, conservando el mismo TTL y límite de resultados.
      const key = `city:v6:${queryKey}:lang=${language}:limit=${limit}`;
      const cachedResult = await cached(
        'citySearchCache',
        key,
        () => loadCities(query, limit, language)
      );

      return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
    } catch (error) {
      logError('City search request failed.', {
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
        errorMessage: String(error?.message || error || 'Unknown error').slice(0, 240),
      });
      throw error;
    }
  }
);
