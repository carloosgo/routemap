import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  error as logError,
  info as logInfo,
} from 'firebase-functions/logger';
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
const CITY_SEARCH_UNAVAILABLE_MESSAGE = 'No fue posible buscar ciudades en este momento.';

function requestedLimit(value) {
  return Math.min(Math.max(Number(value) || MAX_RESULTS, 1), MAX_RESULTS);
}

function requestedLanguage(value) {
  const language = String(value || '').trim().toLowerCase();
  return ALLOWED_LANGUAGES.has(language) ? language : 'es';
}

async function loadProviderCities(query, language) {
  const apiKey = requireGeoapifyKey(
    GEOAPIFY_CITY_API_KEY,
    'GEOAPIFY_CITY_API_KEY'
  );
  const payload = await limitedFetch(
    buildGeoapifyCitySearchUrl({
      query,
      limit: MAX_RESULTS,
      language,
      apiKey,
    })
  );

  return normalizeGeoapifyCityResults(payload.results, {
    language,
    limit: MAX_RESULTS,
    query,
    includeRegionMetadata: true,
  });
}

function providerResults(value) {
  return Array.isArray(value) ? value : [];
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

      try {
        // El catálogo persistido deja de participar en la búsqueda. Se conserva
        // únicamente el cache técnico del proveedor para respetar cuotas y evitar
        // solicitudes repetidas sin convertirlo en una fuente canónica de ciudades.
        const key = `city:live:v1:${queryKey}:lang=${language}:limit=${MAX_RESULTS}`;
        const cachedProvider = await cached(
          'citySearchCache',
          key,
          () => loadProviderCities(query, language)
        );
        const results = providerResults(cachedProvider.result).slice(0, limit);

        logInfo('city_search_metric', {
          source: cachedProvider.cacheHit ? 'provider-cache' : 'provider',
          language,
          resultCount: results.length,
          providerCacheHit: cachedProvider.cacheHit,
        });

        return {
          results,
          cacheHit: cachedProvider.cacheHit,
          source: cachedProvider.cacheHit ? 'provider-cache' : 'provider',
        };
      } catch (providerError) {
        logError('City provider request failed.', {
          errorName: providerError?.name || 'Error',
          errorCode: providerError?.code || '',
          errorMessage: String(providerError?.message || providerError || '').slice(0, 240),
        });
        throw new HttpsError('unavailable', CITY_SEARCH_UNAVAILABLE_MESSAGE);
      }
    } catch (error) {
      logError('City search request failed.', {
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
        errorMessage: String(error?.message || error || 'Unknown error').slice(0, 240),
      });
      if (error instanceof HttpsError) {
        throw new HttpsError(error.code, error.message, error.details);
      }
      throw new HttpsError('internal', 'No fue posible completar la búsqueda de ciudades.');
    }
  }
);
