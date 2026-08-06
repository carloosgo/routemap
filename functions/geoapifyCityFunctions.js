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
  normalized,
  requireGeoapifyKey,
  validCoordinate,
} from './geoapifySupport.js';

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

function mapCity(item) {
  if (
    !item
    || !validCoordinate(item.lat, -90, 90)
    || !validCoordinate(item.lon, -180, 180)
  ) {
    return null;
  }

  const name = String(item.city || item.name || '').trim();
  const country = String(item.country || '').trim();
  const countryCode = String(item.country_code || '').trim().toUpperCase();
  if (!name || !/^[A-Z]{2}$/.test(countryCode)) return null;

  return {
    id: String(item.place_id || `${item.lon}:${item.lat}`).slice(0, 256),
    name: name.slice(0, 120),
    displayName: String(item.formatted || [name, country].filter(Boolean).join(', ')).slice(0, 200),
    country: country.slice(0, 100),
    countryCode,
    lat: Number(item.lat),
    lon: Number(item.lon),
  };
}

async function loadCities(query, limit, language) {
  const params = new URLSearchParams({
    text: query,
    type: 'city',
    format: 'json',
    lang: language,
    limit: String(limit),
    apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
  });
  const payload = await limitedFetch(
    `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
  );
  const seen = new Set();
  return (payload.results || [])
    .map(mapCity)
    .filter((city) => {
      if (!city) return false;
      const key = `${normalized(city.name)}|${city.countryCode}|${city.lat.toFixed(5)}|${city.lon.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export const geoapifyCityAutocomplete = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY] }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.cityAutocomplete);
    const query = String(request.data?.query || '').trim().slice(0, MAX_QUERY_CHARS);
    const queryKey = normalized(query);
    if (queryKey.length < MIN_QUERY_CHARS) {
      throw new HttpsError('invalid-argument', 'La ciudad requiere al menos 3 caracteres.');
    }

    const limit = requestedLimit(request.data?.limit);
    const language = requestedLanguage(request.data?.language);
    const key = `city:${queryKey}:lang=${language}:limit=${limit}`;
    const cachedResult = await cached(
      'citySearchCache',
      key,
      () => loadCities(query, limit, language)
    );

    return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);
