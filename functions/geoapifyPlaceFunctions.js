import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { createSharedCache } from './sharedCache.js';
import { extractPlaceEnrichment } from './geoapifyPlaceEnrichment.js';
import {
  GEOAPIFY_API_KEY,
  QUOTAS,
  cacheDb,
  cached,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  mapPlace,
  normalized,
  requireGeoapifyKey,
} from './geoapifySupport.js';

const MAX_QUERY_CHARS = 160;
const PLACE_ENRICHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cachedEnrichment = createSharedCache(cacheDb, { ttlMs: PLACE_ENRICHMENT_TTL_MS });

function searchLimit(request) {
  return Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
}

function searchQuery(request) {
  const raw = String(request.data?.query || '').trim();
  if (raw.length > MAX_QUERY_CHARS) {
    throw new HttpsError(
      'invalid-argument',
      `La búsqueda no puede superar ${MAX_QUERY_CHARS} caracteres.`
    );
  }
  return raw;
}

function enrichmentInput(request) {
  const lat = Number(request.data?.lat);
  const lon = Number(request.data?.lon);
  const name = String(request.data?.name || '').trim().slice(0, 160);
  if (
    !Number.isFinite(lat)
    || Math.abs(lat) > 90
    || !Number.isFinite(lon)
    || Math.abs(lon) > 180
  ) {
    throw new HttpsError('invalid-argument', 'Coordenadas de lugar inválidas.');
  }
  return {
    lat,
    lon,
    name,
    language: request.data?.language === 'en' ? 'en' : 'es',
  };
}

async function loadAutocomplete(query, limit) {
  const params = new URLSearchParams({
    text: query,
    format: 'json',
    limit: String(limit),
    apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
  });
  const payload = await limitedFetch(
    `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
  );
  return (payload.results || []).map(mapPlace).filter(Boolean);
}

export const geoapifyPlaceSearch = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY] }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.placeSearch);
    const query = searchQuery(request);
    const queryKey = normalized(query);

    if (queryKey.length < 5) {
      throw new HttpsError('invalid-argument', 'La búsqueda requiere al menos 5 caracteres.');
    }

    const limit = searchLimit(request);
    const key = `place:${queryKey}:limit=${limit}`;
    const cachedResult = await cached(
      'placeSearchCache',
      key,
      () => loadAutocomplete(query, limit)
    );

    return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);

export const geoapifyAutocomplete = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY] }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.autocomplete);
    const query = searchQuery(request);
    const queryKey = normalized(query);

    if (queryKey.length < 5) {
      throw new HttpsError('invalid-argument', 'La búsqueda requiere al menos 5 caracteres.');
    }

    const limit = searchLimit(request);
    const key = `autocomplete:${queryKey}:limit=${limit}`;
    const cachedResult = await cached(
      'geocodeCache',
      key,
      () => loadAutocomplete(query, limit)
    );

    return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);

export const geoapifyPlaceDetails = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY] }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.placeDetails);
    const placeId = String(request.data?.placeId || '').trim();
    if (!placeId || placeId.length > 300) {
      throw new HttpsError('invalid-argument', 'Identificador de lugar inválido.');
    }

    const cachedResult = await cached('placeDetailsCache', `details:${placeId}`, async () => {
      const params = new URLSearchParams({
        id: placeId,
        features: 'details',
        apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
      });
      const payload = await limitedFetch(
        `https://api.geoapify.com/v2/place-details?${params}`
      );
      const details = payload.features?.find(
        (feature) => feature.properties?.feature_type === 'details'
      ) || payload.features?.[0];

      return {
        image: String(details?.properties?.wiki_and_media?.image || '').trim(),
      };
    });

    return { ...cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);

export const geoapifyPlaceEnrichment = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.placeDetails);
    const input = enrichmentInput(request);
    const key = [
      'enrichment',
      input.lat.toFixed(5),
      input.lon.toFixed(5),
      normalized(input.name),
      input.language,
    ].join(':');

    const cachedResult = await cachedEnrichment(
      'placeEnrichmentCache',
      key,
      async () => {
        const params = new URLSearchParams({
          lat: String(input.lat),
          lon: String(input.lon),
          features: 'details',
          lang: input.language,
          apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
        });
        const payload = await limitedFetch(
          `https://api.geoapify.com/v2/place-details?${params}`
        );
        return {
          ...extractPlaceEnrichment(payload, input),
          fetchedAt: new Date().toISOString(),
        };
      }
    );

    return { ...cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);