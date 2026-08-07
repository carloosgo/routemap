import { config } from '../../config.js';
import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';

const pendingRequests = new Map();

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

export async function loadGoogleCountryPlaceIds(countries, { signal } = {}) {
  const unique = new Map();
  (Array.isArray(countries) ? countries : []).forEach((country) => {
    const countryCode = cleanCountryCode(country?.countryCode);
    const name = String(country?.country || '').trim().slice(0, 100);
    if (countryCode && name && !unique.has(countryCode)) {
      unique.set(countryCode, { countryCode, country: name });
    }
  });
  if (!unique.size) return [];

  const cache = readCache();
  const resolved = [];
  const missing = [];
  unique.forEach((country, countryCode) => {
    const cached = cache[countryCode];
    if (cached?.placeId) {
      resolved.push({ countryCode, placeId: cached.placeId, localCacheHit: true });
    } else {
      missing.push(country);
    }
  });

  if (!missing.length) return resolved;
  throwIfAborted(signal);

  const key = missing.map((country) => country.countryCode).sort().join('|');
  let pending = pendingRequests.get(key);
  if (!pending) {
    pending = (async () => {
      const request = firebaseCallable('googleCountryPlaceIds');
      const response = await request({
        countries: missing,
        language: config.defaultLocale,
      });
      return Array.isArray(response.data?.countries) ? response.data.countries : [];
    })();
    pendingRequests.set(key, pending);
  }

  try {
    const remote = await pending;
    throwIfAborted(signal);
    remote.forEach((country) => {
      const countryCode = cleanCountryCode(country?.countryCode);
      const placeId = cleanPlaceId(country?.placeId);
      if (!countryCode || !placeId) return;
      rememberCountry(cache, country);
      resolved.push({ ...country, countryCode, placeId });
    });
    writeCache(cache);
    return resolved;
  } finally {
    if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
  }
}
