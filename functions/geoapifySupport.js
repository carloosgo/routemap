import RequestRateLimiter from '@geoapify/request-rate-limiter';
import { info as logInfo } from 'firebase-functions/logger';
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

function safeMetricToken(value, fallback = '') {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_./:-]{1,80}$/.test(normalizedValue)
    ? normalizedValue
    : fallback;
}

export function providerRequestMetricDescriptor(url, serviceName = '') {
  let hostname = '';
  let pathname = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname;
  } catch {
    // La URL nunca se registra; una URL inválida solo cae en etiquetas genéricas.
  }

  let provider = 'other';
  if (hostname.endsWith('geoapify.com')) provider = 'geoapify';
  else if (hostname.endsWith('googleapis.com')) provider = 'google';
  else if (hostname === 'overpass-api.de' || hostname.endsWith('.overpass-api.de')) provider = 'overpass';
  else if (String(serviceName).toLowerCase().includes('geoapify')) provider = 'geoapify';
  else if (String(serviceName).toLowerCase().includes('google')) provider = 'google';

  let operation = 'request';
  if (pathname.includes('/v1/batch/geocode/search')) operation = 'batch-geocode';
  else if (pathname.includes('/v1/geocode/autocomplete')) operation = 'geocode-autocomplete';
  else if (pathname.includes('/v1/geocode/reverse')) operation = 'geocode-reverse';
  else if (pathname.includes('/v1/geocode/search')) operation = 'geocode-search';
  else if (pathname.includes('/v1/routing')) operation = 'route';
  else if (pathname.includes('/places:autocomplete')) operation = 'places-autocomplete';
  else if (pathname.includes('/places:searchText')) operation = 'places-search';
  else if (/\/v1\/places\/[^/]+$/.test(pathname)) operation = 'place-details';
  else if (pathname.includes('directions/v2:computeRoutes')) operation = 'route';
  else if (pathname.includes('/api/interpreter')) operation = 'boundary';

  return { provider, operation };
}

function defaultProviderMetricSink(metric) {
  logInfo('storage_v4_provider_request_metric', metric);
}

function emitProviderMetric(metricSink, metric) {
  if (typeof metricSink !== 'function') return;
  try {
    metricSink(metric);
  } catch {
    // La observabilidad es best-effort y no puede romper una llamada de proveedor.
  }
}

async function parseJsonResponse(response, serviceName) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(`${serviceName} devolvió JSON inválido.`);
    error.code = 'invalid-json';
    throw error;
  }
}

export async function limitedFetch(
  url,
  options = {},
  serviceName = 'Geoapify',
  { metricSink = defaultProviderMetricSink, now = () => Date.now() } = {}
) {
  const descriptor = providerRequestMetricDescriptor(url, serviceName);
  const [result] = await RequestRateLimiter.rateLimitedRequests([
    async () => {
      const startedAt = now();
      let response;
      try {
        response = await fetch(url, options);
      } catch (error) {
        emitProviderMetric(metricSink, {
          ...descriptor,
          outcome: 'network-error',
          status: 0,
          durationMs: Math.max(0, now() - startedAt),
          errorCode: safeMetricToken(error?.code),
        });
        throw error;
      }

      if (!response.ok) {
        emitProviderMetric(metricSink, {
          ...descriptor,
          outcome: 'http-error',
          status: Number(response.status) || 0,
          durationMs: Math.max(0, now() - startedAt),
        });
        const error = new Error(`${serviceName} respondió ${response.status}.`);
        error.code = `http-${response.status}`;
        throw error;
      }

      try {
        const payload = await parseJsonResponse(response, serviceName);
        emitProviderMetric(metricSink, {
          ...descriptor,
          outcome: 'success',
          status: Number(response.status) || 200,
          durationMs: Math.max(0, now() - startedAt),
        });
        return payload;
      } catch (error) {
        emitProviderMetric(metricSink, {
          ...descriptor,
          outcome: 'parse-error',
          status: Number(response.status) || 200,
          durationMs: Math.max(0, now() - startedAt),
          errorCode: safeMetricToken(error?.code),
        });
        throw error;
      }
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
