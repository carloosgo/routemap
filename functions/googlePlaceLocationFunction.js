import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_MAPS_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError } from './geoapifySupport.js';
import { createSharedCache } from './sharedCache.js';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_LOCATION_FIELDS = 'id,location';
// Google permite cachear lat/lon hasta 30 días. Usamos 29 días como margen operativo.
const GOOGLE_LOCATION_CACHE_TTL_MS = 29 * 24 * 60 * 60 * 1000;
const cachedGoogleLocation = createSharedCache(db, { ttlMs: GOOGLE_LOCATION_CACHE_TTL_MS });

function requireGoogleKey() {
  const key = GOOGLE_MAPS_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_MAPS_API_KEY.');
  }
  return key;
}

function cleanPlaceId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 256) : '';
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

async function fetchGoogleLocation(placeId) {
  const payload = await limitedFetch(
    `${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': requireGoogleKey(),
        'X-Goog-FieldMask': GOOGLE_LOCATION_FIELDS,
      },
    },
    'Google Places location'
  );
  const lat = Number(payload?.location?.latitude);
  const lon = Number(payload?.location?.longitude);
  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    throw new Error('Google Places no devolvió una ubicación válida.');
  }
  return { placeId, lat, lon, fetchedAt: Date.now() };
}

export const googlePlaceLocations = onCall(
  callableOptions({
    secrets: [GOOGLE_MAPS_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googlePlaceLocations);
    const placeIds = [...new Set(
      (Array.isArray(request.data?.placeIds) ? request.data.placeIds : [])
        .map(cleanPlaceId)
        .filter(Boolean)
    )].slice(0, 20);
    if (!placeIds.length) return { locations: [] };

    try {
      const locations = await Promise.all(
        placeIds.map(async (placeId) => {
          const cached = await cachedGoogleLocation(
            'googlePlaceLocationCache',
            `google-place-location:${placeId}`,
            () => fetchGoogleLocation(placeId)
          );
          return { ...cached.result, cacheHit: cached.cacheHit };
        })
      );
      return { locations };
    } catch (error) {
      logError('Google place location cache failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible resolver las ubicaciones guardadas.');
    }
  }
);
