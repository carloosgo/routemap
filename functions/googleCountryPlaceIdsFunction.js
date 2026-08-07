import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_PLACES_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError } from './geoapifySupport.js';
import { createSharedCache } from './sharedCache.js';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const COUNTRY_ID_FIELDS = 'places.id';
// Place IDs pueden almacenarse. Los refrescamos antes de cumplir un año para
// evitar depender indefinidamente de un ID que Google haya reemplazado.
const COUNTRY_PLACE_ID_CACHE_TTL_MS = 330 * 24 * 60 * 60 * 1000;
const cachedCountryPlaceId = createSharedCache(db, {
  ttlMs: COUNTRY_PLACE_ID_CACHE_TTL_MS,
});

function requireGooglePlacesKey() {
  const key = GOOGLE_PLACES_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_PLACES_API_KEY.');
  }
  return key;
}

function cleanCountryName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 100) : '';
}

function cleanCountryCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function validLanguage(value) {
  return value === 'en' ? 'en' : 'es';
}

function cleanPlaceId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 256) : '';
}

async function fetchCountryPlaceId(country, language) {
  const query = `${country.country} (${country.countryCode})`;
  const payload = await limitedFetch(
    `${GOOGLE_PLACES_BASE}/places:searchText`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': requireGooglePlacesKey(),
        'X-Goog-FieldMask': COUNTRY_ID_FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: language,
        maxResultCount: 1,
      }),
    },
    'Google Places country ID'
  );
  const placeId = cleanPlaceId(payload?.places?.[0]?.id);
  if (!placeId) throw new Error(`Google Places no devolvió un ID para ${country.countryCode}.`);
  return {
    countryCode: country.countryCode,
    placeId,
    fetchedAt: Date.now(),
  };
}

export const googleCountryPlaceIds = onCall(
  callableOptions({
    secrets: [GOOGLE_PLACES_API_KEY],
    enforceAppCheck: false,
    maxInstances: 4,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googleCountryPlaceIds);
    const language = validLanguage(request.data?.language);
    const countries = [];
    const seen = new Set();

    for (const item of Array.isArray(request.data?.countries) ? request.data.countries : []) {
      const countryCode = cleanCountryCode(item?.countryCode);
      const country = cleanCountryName(item?.country);
      if (!countryCode || !country || seen.has(countryCode)) continue;
      seen.add(countryCode);
      countries.push({ countryCode, country });
      if (countries.length >= 12) break;
    }

    if (!countries.length) return { countries: [] };

    try {
      const resolved = await Promise.all(
        countries.map(async (country) => {
          const cached = await cachedCountryPlaceId(
            'googleCountryPlaceIdCache',
            `google-country:${country.countryCode}`,
            () => fetchCountryPlaceId(country, language)
          );
          return { ...cached.result, cacheHit: cached.cacheHit };
        })
      );
      return { countries: resolved };
    } catch (error) {
      logError('Google country place ID lookup failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible resolver los países para el mapa.');
    }
  }
);
