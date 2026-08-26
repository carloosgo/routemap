import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  error as logError,
  info as logInfo,
  warn as logWarn,
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
import {
  persistCityCatalogQuery,
  readCityCatalogQuery,
} from './cityCatalog.js';

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

function attributionByPlaceId(items) {
  const result = {};
  for (const item of Array.isArray(items) ? items : []) {
    const placeId = String(item?.place_id || '').trim();
    const datasource = item?.datasource;
    if (!placeId || !datasource || typeof datasource !== 'object') continue;
    result[placeId] = {
      dataSource: String(datasource.name || '').trim(),
      attribution: String(datasource.attribution || '').trim(),
      license: String(datasource.license || '').trim(),
      url: String(datasource.url || '').trim(),
    };
  }
  return result;
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

  return {
    results: normalizeGeoapifyCityResults(payload.results, {
      language,
      limit: MAX_RESULTS,
      query,
      includeRegionMetadata: true,
    }),
    attributionByProviderId: attributionByPlaceId(payload.results),
  };
}

function providerData(value) {
  if (value && typeof value === 'object' && Array.isArray(value.results)) {
    return {
      results: value.results,
      attributionByProviderId:
        value.attributionByProviderId && typeof value.attributionByProviderId === 'object'
          ? value.attributionByProviderId
          : {},
    };
  }
  return { results: [], attributionByProviderId: {} };
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
      let catalogLookup = { status: 'miss', results: [] };

      try {
        catalogLookup = await readCityCatalogQuery(db, {
          queryKey,
          language,
          limit,
        });
        if (catalogLookup.status === 'fresh') {
          logInfo('city_catalog_metric', {
            source: 'catalog',
            state: 'fresh',
            language,
            resultCount: catalogLookup.results.length,
          });
          return {
            results: catalogLookup.results,
            cacheHit: true,
            source: 'catalog',
          };
        }
      } catch (catalogError) {
        logWarn('City catalog read failed; provider fallback remains available.', {
          errorName: catalogError?.name || 'Error',
          errorMessage: String(catalogError?.message || catalogError || '').slice(0, 200),
        });
      }

      try {
        // v8 invalida el payload v7 porque el cache de proveedor ahora conserva
        // también la atribución necesaria para materializar el catálogo Atlas.
        const key = `city:v8:${queryKey}:lang=${language}:limit=${MAX_RESULTS}`;
        const cachedProvider = await cached(
          'citySearchCache',
          key,
          () => loadProviderCities(query, language)
        );
        const loaded = providerData(cachedProvider.result);

        let atlasResults = [];
        try {
          atlasResults = await persistCityCatalogQuery(db, {
            queryKey,
            language,
            provider: 'geoapify',
            providerResults: loaded.results,
            attributionByProviderId: loaded.attributionByProviderId,
          });
        } catch (catalogWriteError) {
          logWarn('City catalog persistence failed; provider results remain usable.', {
            errorName: catalogWriteError?.name || 'Error',
            errorMessage: String(
              catalogWriteError?.message || catalogWriteError || ''
            ).slice(0, 200),
          });
        }

        const results = (atlasResults.length > 0 ? atlasResults : loaded.results)
          .slice(0, limit);
        logInfo('city_catalog_metric', {
          source: atlasResults.length > 0 ? 'catalog-refresh' : 'provider',
          state: catalogLookup.status,
          language,
          resultCount: results.length,
          providerCacheHit: cachedProvider.cacheHit,
        });

        return {
          results,
          cacheHit: cachedProvider.cacheHit,
          source: atlasResults.length > 0 ? 'catalog-refresh' : 'provider',
        };
      } catch (providerError) {
        if (catalogLookup.status === 'stale' && catalogLookup.results.length > 0) {
          logWarn('City provider failed; serving stale canonical catalog projection.', {
            language,
            resultCount: catalogLookup.results.length,
          });
          return {
            results: catalogLookup.results,
            cacheHit: true,
            source: 'catalog-stale',
          };
        }
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
