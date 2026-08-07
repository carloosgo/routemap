import { config } from '../../config.js';
import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';

const pendingRequests = new Map();
const MAX_COUNTRIES_PER_REQUEST = 10;

function now() {
  return Date.now();
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function cleanCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function cleanPlaceId(value) {
  return String(value || '').trim().slice(0, 256);
}

function readCache() {
  const target = storage();
  if (!target) return {};
  try {
    const parsed = JSON.parse(target.getItem(config.googleMaps.countryPlaceIdCacheKey) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const current = now();
    const valid = {};
    let changed = false;
    Object.entries(parsed).forEach(([countryCode, item]) => {
      const code = cleanCountryCode(countryCode);
      const placeId = cleanPlaceId(item?.placeId);
      const expiresAt = Number(item?.expiresAt) || 0;
      if (code && placeId && expiresAt > current) {
        valid[code] = { placeId, expiresAt };
      } else {
        changed = true;
      }
    });
    if (changed) target.setItem(config.googleMaps.countryPlaceIdCacheKey, JSON.stringify(valid));
    return valid;
  } catch {
    return {};
  }
}

function writeCache(cache) {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(config.googleMaps.countryPlaceIdCacheKey, JSON.stringify(cache));
  } catch {
    // El backend conserva la caché compartida si localStorage no está disponible.
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function rememberCountry(cache, country) {
  const countryCode = cleanCountryCode(country?.countryCode);
  const placeId = cleanPlaceId(country?.placeId);
  if (!countryCode || !placeId) return;
  const fetchedAt = Number(country?.fetchedAt) || now();
  const expiresAt = fetchedAt + config.googleMaps.countryPlaceIdCacheTtlMs;
  if (expiresAt <= now()) return;
  cache[countryCode] = { placeId, expiresAt };
}

async function loadRemoteBatch(countryCodes, signal) {
  const key = countryCodes.slice().sort().join('|');
  let pending = pendingRequests.get(key);
  if (!pending) {
    pending = (async () => {
      const request = firebaseCallable('googleCountryPlaceIds');
      const response = await request({
        countries: countryCodes.map((countryCode) => ({ countryCode })),
      });
      return {
        countries: Array.isArray(response.data?.countries) ? response.data.countries : [],
        unresolvedCountryCodes: Array.isArray(response.data?.unresolvedCountryCodes)
          ? response.data.unresolvedCountryCodes
          : [],
      };
    })();
    pendingRequests.set(key, pending);
  }

  try {
    const result = await pending;
    throwIfAborted(signal);
    return result;
  } finally {
    if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
  }
}

export async function loadGoogleCountryPlaceIds(countries, { signal } = {}) {
  const unique = new Set();
  (Array.isArray(countries) ? countries : []).forEach((country) => {
    const countryCode = cleanCountryCode(country?.countryCode);
    if (countryCode) unique.add(countryCode);
  });
  if (!unique.size) return [];

  const cache = readCache();
  const resolved = [];
  const missing = [];
  unique.forEach((countryCode) => {
    const cached = cache[countryCode];
    if (cached?.placeId) {
      resolved.push({ countryCode, placeId: cached.placeId, localCacheHit: true });
    } else {
      missing.push(countryCode);
    }
  });

  for (let index = 0; index < missing.length; index += MAX_COUNTRIES_PER_REQUEST) {
    throwIfAborted(signal);
    const batch = missing.slice(index, index + MAX_COUNTRIES_PER_REQUEST);
    const remote = await loadRemoteBatch(batch, signal);
    remote.countries.forEach((country) => {
      const countryCode = cleanCountryCode(country?.countryCode);
      const placeId = cleanPlaceId(country?.placeId);
      if (!countryCode || !placeId) return;
      rememberCountry(cache, country);
      resolved.push({ ...country, countryCode, placeId });
    });
    if (remote.unresolvedCountryCodes.length) {
      console.warn(
        '[Google Maps] Region Lookup could not resolve country codes:',
        remote.unresolvedCountryCodes.join(', ')
      );
    }
  }

  writeCache(cache);
  return resolved;
}
