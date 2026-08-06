import RequestRateLimiter from '@geoapify/request-rate-limiter';
import { HttpsError } from 'firebase-functions/v2/https';

export function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

export function validPoint(point) {
  return Boolean(
    point
      && validCoordinate(point.lat, -90, 90)
      && validCoordinate(point.lon, -180, 180)
  );
}

export function safeError(error) {
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

export async function limitedFetch(url, options = {}, serviceName = 'Geoapify') {
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

export function requireGeoapifyKey(secret, secretName = 'GEOAPIFY_API_KEY') {
  const key = secret.value();
  if (!key) {
    throw new HttpsError('failed-precondition', `Falta el secreto ${secretName}.`);
  }
  return key;
}

export function mapPlace(item) {
  if (
    !item
    || !validCoordinate(item.lat, -90, 90)
    || !validCoordinate(item.lon, -180, 180)
  ) {
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

export function batchResultItem(item) {
  const candidate = item?.result ?? item;
  if (Array.isArray(candidate?.results)) return candidate.results[0] || null;
  if (Array.isArray(candidate?.features)) return candidate.features[0]?.properties || null;
  return candidate || null;
}
