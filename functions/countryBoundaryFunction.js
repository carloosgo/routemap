import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { error as logError, warn as logWarn } from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { cacheId } from './sharedCache.js';
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
import {
  CACHE_TTL_MS,
  COUNTRY_BOUNDARY_CACHE_MAX_BYTES,
  QUOTAS,
  cacheDb,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  safeError,
  validCoordinate,
} from './geoapifySupport.js';
import { iso2ToIso3 } from './isoCountryCodes.js';

async function cachedCountryBoundary(key, loader) {
  const ref = cacheDb.collection('countryBoundaryCache').doc(cacheId(key));
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

async function downloadCountryBoundary(countryCode, iso3) {
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
}

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
      const cachedResult = await cachedCountryBoundary(
        key,
        () => downloadCountryBoundary(countryCode, iso3)
      );

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