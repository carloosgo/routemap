import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { error as logError, warn as logWarn } from 'firebase-functions/logger';
import RequestRateLimiter from '@geoapify/request-rate-limiter';
import { callableOptions, enforceQuota, requireAuthenticated } from './callablePolicy.js';
import { cacheId, createSharedCache } from './sharedCache.js';
import {
  buildCountryLandFeature,
  decodeCountryBoundary,
  encodeCountryBoundary,
  isCountryBoundaryFeature,
  utf8ByteLength,
} from './countryBoundaryUtils.js';
import {
  COUNTRY_BOUNDARY_GEOMETRY_SOURCE,
  countryBoundaryCacheKey,
  countryBoundaryDownloadUrls,
  countryBoundaryMetadataUrl,
} from './countryBoundaryRequest.js';
import { iso2ToIso3 } from './isoCountryCodes.js';

initializeApp();
const db = getFirestore();
const GEOAPIFY_API_KEY = defineSecret('GEOAPIFY_API_KEY');
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const BATCH_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const COUNTRY_BOUNDARY_CACHE_MAX_BYTES = 850 * 1024;
const ALLOWED_MODES = new Set(['drive', 'walk', 'bicycle', 'transit']);
const cached = createSharedCache(db, { ttlMs: CACHE_TTL_MS });

const QUOTAS = Object.freeze({
  placeSearch: { scope: 'geoapify-place-search', maxRequests: 30, windowMs: 60_000 },
  autocomplete: { scope: 'geoapify-autocomplete', maxRequests: 30, windowMs: 60_000 },
  placeDetails: { scope: 'geoapify-place-details', maxRequests: 30, windowMs: 60_000 },
  route: { scope: 'geoapify-route', maxRequests: 20, windowMs: 60_000 },
  reverse: { scope: 'geoapify-reverse', maxRequests: 20, windowMs: 60_000 },
  batchSubmit: { scope: 'geoapify-batch-submit', maxRequests: 2, windowMs: 60 * 60_000 },
  batchResult: { scope: 'geoapify-batch-result', maxRequests: 30, windowMs: 60 * 60_000 },
  countryBoundary: { scope: 'country-boundary', maxRequests: 10, windowMs: 60_000 },
});

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function validPoint(point) {
  return point
    && validCoordinate(point.lat, -90, 90)
    && validCoordinate(point.lon, -180, 180);
}

function safeError(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || '',
    message: String(error?.message || error || 'Unknown error').slice(0, 300),
  };
}

async function parseJsonResponse(response, serviceName) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${serviceName} devolvió JSON inválido.`);
  }
}

async function limitedFetch(url, options = {}, serviceName = 'Geoapify') {
  const [result] = await RequestRateLimiter.rateLimitedRequests([
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`${serviceName} respondió ${response.status}.`);
      }
      return parseJsonResponse(response, serviceName);
    },
  ], 5, 1000, { maxConcurrentRequests: 2 });

  if (result instanceof Error) throw result;
  return result;
}

async function cachedCountryBoundary(key, loader) {
  const ref = db.collection('countryBoundaryCache').doc(cacheId(key));
  const snapshot = await ref.get();
  const data = snapshot.data();
  const timestamp = data?.timestamp?.toMillis?.() || 0;
  const expiresAt = data?.expiresAt?.toMillis?.() || (timestamp + CACHE_TTL_MS);
  const cachedFeature = decodeCountryBoundary(data?.resultJson ?? data?.result);

  if (isCountryBoundaryFeature(cachedFeature) && Date.now() < expiresAt) {
    return { result: cachedFeature, cacheHit: true };
  }

  const result = await loader();
  const resultJson = encodeCountryBoundary(result);
  const resultBytes = utf8ByteLength(resultJson);

  if (resultBytes <= COUNTRY_BOUNDARY_CACHE_MAX_BYTES) {
    try {
      const now = Date.now();
      await ref.set({
        resultJson,
        resultBytes,
        timestamp: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + CACHE_TTL_MS),
      });
    } catch (error) {
      logWarn('Country boundary cache write failed; returning live geometry.', {
        cacheKeyHash: cacheId(key),
        resultBytes,
        error: safeError(error),
      });
    }
  } else {
    logWarn('Country boundary exceeds safe Firestore cache size; returning live geometry.', {
      cacheKeyHash: cacheId(key),
      resultBytes,
      maxBytes: COUNTRY_BOUNDARY_CACHE_MAX_BYTES,
    });
  }

  return { result, cacheHit: false };
}

function requireKey() {
  const key = GEOAPIFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Falta el secreto GEOAPIFY_API_KEY.');
  return key;
}

function mapPlace(item) {
  if (!item || !validCoordinate(item.lat, -90, 90) || !validCoordinate(item.lon, -180, 180)) {
    return null;
  }

  return {
    id: item.place_id || `${item.lon}:${item.lat}`,
    name: item.name || item.formatted || 'Lugar',
    formatted: item.formatted || '',
    address: item.address_line2 || item.address_line1 || item.formatted || '',
    city: item.city || item.county || '',
    country: item.country || '',
    countryCode: String(item.country_code || '').toUpperCase(),
    category: item.category || item.result_type || '',
    lat: Number(item.lat),
    lon: Number(item.lon),
  };
}

function batchResultItem(item) {
  const candidate = item?.result ?? item;
  if (Array.isArray(candidate?.results)) return candidate.results[0] || null;
  if (Array.isArray(candidate?.features)) return candidate.features[0]?.properties || null;
  return candidate || null;
}

async function cacheCompletedBatchRows(rows, mappedResults) {
  const writer = db.bulkWriter();
  const expiresAt = Timestamp.fromMillis(Date.now() + CACHE_TTL_MS);
  let writes = 0;

  rows.forEach((row, index) => {
    const queryKey = normalized(row?.query?.text || row?.query || '');
    const result = mappedResults[index];
    if (queryKey.length < 5 || !result) return;

    const ref = db.collection('geocodeCache').doc(cacheId(`batch:${queryKey}`));
    writer.set(ref, {
      result,
      timestamp: FieldValue.serverTimestamp(),
      expiresAt,
    });
    writes += 1;
  });

  if (writes > 0) await writer.close();
  else await writer.close();
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

    const limit = Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
    const key = `place:${queryKey}:limit=${limit}`;
    const cachedResult = await cached('placeSearchCache', key, async () => {
      const params = new URLSearchParams({
        text: query,
        format: 'json',
        limit: String(limit),
        apiKey: requireKey(),
      });
      const payload = await limitedFetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
      );
      return (payload.results || []).map(mapPlace).filter(Boolean);
    });

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

    const limit = Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
    const key = `autocomplete:${queryKey}:limit=${limit}`;
    const cachedResult = await cached('geocodeCache', key, async () => {
      const params = new URLSearchParams({
        text: query,
        format: 'json',
        limit: String(limit),
        apiKey: requireKey(),
      });
      const payload = await limitedFetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
      );
      return (payload.results || []).map(mapPlace).filter(Boolean);
    });

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
        apiKey: requireKey(),
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

export const geoapifyRoute = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY], maxInstances: 6 }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.route);
    const { origin, destination } = request.data || {};
    const mode = ALLOWED_MODES.has(request.data?.mode) ? request.data.mode : 'drive';

    if (!validPoint(origin) || !validPoint(destination)) {
      throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
    }

    const signature = `${Number(origin.lat).toFixed(6)},${Number(origin.lon).toFixed(6)}|${Number(destination.lat).toFixed(6)},${Number(destination.lon).toFixed(6)}|${mode}`;
    const cachedResult = await cached('routeCache', signature, async () => {
      const params = new URLSearchParams({
        waypoints: `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`,
        mode,
        format: 'geojson',
        apiKey: requireKey(),
      });
      const payload = await limitedFetch(`https://api.geoapify.com/v1/routing?${params}`);
      const feature = payload.features?.[0];
      if (!feature) throw new Error('Geoapify no devolvió una ruta.');

      return {
        signature,
        mode,
        geometry: feature.geometry,
        distance: Number(feature.properties?.distance) || 0,
        duration: Number(feature.properties?.time) || 0,
        calculatedAt: new Date().toISOString(),
      };
    });

    return { ...cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);

export const geoapifyReverse = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY] }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.reverse);
    const point = request.data?.point;
    if (!validPoint(point)) {
      throw new HttpsError('invalid-argument', 'Punto inválido.');
    }

    const key = `reverse:${Number(point.lat).toFixed(6)},${Number(point.lon).toFixed(6)}`;
    const cachedResult = await cached('geocodeCache', key, async () => {
      const params = new URLSearchParams({
        lat: String(point.lat),
        lon: String(point.lon),
        format: 'json',
        limit: '1',
        apiKey: requireKey(),
      });
      const payload = await limitedFetch(
        `https://api.geoapify.com/v1/geocode/reverse?${params}`
      );
      return payload.results?.[0] || null;
    });

    return { result: cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);

export const geoapifyBatchGeocode = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    timeoutSeconds: 60,
    maxInstances: 2,
    concurrency: 2,
  }),
  async (request) => {
    const uid = requireAuthenticated(request);
    await enforceQuota(db, request, QUOTAS.batchSubmit);
    const rawQueries = Array.isArray(request.data?.queries) ? request.data.queries : [];

    if (!rawQueries.length || rawQueries.length > 1000) {
      throw new HttpsError(
        'invalid-argument',
        'El batch requiere entre 1 y 1,000 ubicaciones.'
      );
    }

    const queries = rawQueries.map((query) => String(query || '').trim());
    if (queries.some((query) => normalized(query).length < 5)) {
      throw new HttpsError(
        'invalid-argument',
        'Cada ubicación del batch requiere al menos 5 caracteres.'
      );
    }

    const params = new URLSearchParams({ apiKey: requireKey() });
    const job = await limitedFetch(
      `https://api.geoapify.com/v1/batch/geocode/search?${params}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queries),
      }
    );
    const jobId = String(job?.id || '').trim();
    if (!jobId) throw new Error('Geoapify no devolvió un identificador de batch.');

    const now = Date.now();
    await db.collection('geoapifyBatchJobs').doc(cacheId(jobId)).set({
      ownerUid: uid,
      providerJobId: jobId,
      queryCount: queries.length,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + BATCH_JOB_TTL_MS),
    });

    return {
      jobId,
      status: 'pending',
      queryCount: queries.length,
    };
  }
);

export const geoapifyBatchGeocodeResult = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    timeoutSeconds: 60,
    maxInstances: 4,
    concurrency: 10,
  }),
  async (request) => {
    const uid = requireAuthenticated(request);
    await enforceQuota(db, request, QUOTAS.batchResult);
    const jobId = String(request.data?.jobId || '').trim();
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(jobId)) {
      throw new HttpsError('invalid-argument', 'Identificador de batch inválido.');
    }

    const jobSnapshot = await db.collection('geoapifyBatchJobs').doc(cacheId(jobId)).get();
    const job = jobSnapshot.data();
    if (!job || job.ownerUid !== uid || job.providerJobId !== jobId) {
      throw new HttpsError('not-found', 'No existe un batch accesible con ese identificador.');
    }
    if ((job.expiresAt?.toMillis?.() || 0) <= Date.now()) {
      throw new HttpsError('not-found', 'El resultado del batch ya expiró.');
    }

    const params = new URLSearchParams({ id: jobId, apiKey: requireKey() });
    const payload = await limitedFetch(
      `https://api.geoapify.com/v1/batch/geocode/search?${params}`
    );

    if (!Array.isArray(payload)) {
      return { jobId, status: String(payload?.status || 'pending'), results: [] };
    }

    const results = payload.map((item) => mapPlace(batchResultItem(item)));
    await cacheCompletedBatchRows(payload, results);
    return { jobId, status: 'completed', results };
  }
);

export const geoapifyCountryBoundary = onCall(
  callableOptions({ timeoutSeconds: 120, memory: '512MiB', maxInstances: 4 }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.countryBoundary);
    const lat = Number(request.data?.lat);
    const lon = Number(request.data?.lon);
    const countryCode = String(request.data?.countryCode || '').trim().toUpperCase();

    if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
      throw new HttpsError('invalid-argument', 'Coordenadas inválidas.');
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new HttpsError('invalid-argument', 'Código de país inválido.');
    }

    const iso3 = iso2ToIso3(countryCode);
    if (!iso3) {
      throw new HttpsError(
        'invalid-argument',
        `No existe conversión ISO-3 para ${countryCode}.`
      );
    }

    try {
      const key = countryBoundaryCacheKey(countryCode);
      const cachedResult = await cachedCountryBoundary(key, async () => {
        const metadataUrl = countryBoundaryMetadataUrl(iso3);
        const metadata = await limitedFetch(
          metadataUrl,
          { headers: { Accept: 'application/json' } },
          'geoBoundaries'
        );
        const downloadUrls = countryBoundaryDownloadUrls(metadata);

        if (!downloadUrls.length) {
          throw new HttpsError(
            'not-found',
            `geoBoundaries no publicó un ADM0 completo para ${countryCode}.`
          );
        }

        let payload = null;
        let lastError = null;
        for (const downloadUrl of downloadUrls) {
          try {
            payload = await limitedFetch(
              downloadUrl,
              {
                headers: {
                  Accept: 'application/geo+json, application/json',
                  'User-Agent': 'AtlasMap country boundary service',
                },
              },
              'geoBoundaries'
            );
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!payload) throw lastError || new Error('No se descargó la geometría ADM0.');

        const feature = buildCountryLandFeature(payload, {
          countryCode,
          iso3,
          name: metadata?.boundaryName || '',
        });

        if (!feature) {
          throw new HttpsError(
            'not-found',
            `geoBoundaries no devolvió un polígono terrestre válido para ${countryCode}.`
          );
        }

        return feature;
      });

      return {
        feature: cachedResult.result,
        cacheHit: cachedResult.cacheHit,
        geometrySource: COUNTRY_BOUNDARY_GEOMETRY_SOURCE,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      logError('geoapifyCountryBoundary failed.', {
        countryCode,
        iso3,
        lat,
        lon,
        error: safeError(error),
      });
      throw new HttpsError(
        'internal',
        `No fue posible obtener el límite terrestre de ${countryCode}.`
      );
    }
  }
);
