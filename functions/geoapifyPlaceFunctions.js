import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import {
  GEOAPIFY_API_KEY,
  QUOTAS,
  cached,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  mapPlace,
  normalized,
  requireGeoapifyKey,
} from './geoapifySupport.js';

function searchLimit(request) {
  return Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
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
    const query = String(request.data?.query || '').trim();
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
    const query = String(request.data?.query || '').trim();
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
