import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_REGION_LOOKUP_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError } from './geoapifySupport.js';
import { cacheId } from './sharedCache.js';

const REGION_LOOKUP_URL = 'https://regionlookup.googleapis.com/v1alpha:lookupRegion';
const COUNTRY_PLACE_ID_CACHE_TTL_MS = 330 * 24 * 60 * 60 * 1000;
const COUNTRY_CACHE_COLLECTION = 'googleCountryRegionPlaceIdCache';
const COUNTRY_CACHE_KEY_VERSION = 'v2';
const MAX_COUNTRIES_PER_REQUEST = 10;

function requireRegionLookupKey() {
  const key = GOOGLE_REGION_LOOKUP_API_KEY.value();
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'Falta el secreto GOOGLE_REGION_LOOKUP_API_KEY.'
    );
  }
  return key;
}

function cleanCountryCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function cleanPlaceId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 256) : '';
}

function countryCacheRef(countryCode) {
  const key = `google-region-country:${COUNTRY_CACHE_KEY_VERSION}:${countryCode}`;
  return db.collection(COUNTRY_CACHE_COLLECTION).doc(cacheId(key));
}

async function readCountryCache(countryCodes) {
  const current = Date.now();
  const snapshots = await Promise.all(
    countryCodes.map((countryCode) => countryCacheRef(countryCode).get())
  );
  const resolved = [];
  const missing = [];

  snapshots.forEach((snapshot, index) => {
    const countryCode = countryCodes[index];
    const data = snapshot.data();
    const expiresAt = data?.expiresAt?.toMillis?.() || 0;
    const placeId = cleanPlaceId(data?.result?.placeId);
    if (placeId && expiresAt > current) {
      resolved.push({
        countryCode,
        placeId,
        fetchedAt: Number(data?.result?.fetchedAt) || current,
        cacheHit: true,
      });
    } else {
      missing.push(countryCode);
    }
  });

  return { resolved, missing };
}

async function writeCountryCache(countries) {
  if (!countries.length) return;
  const batch = db.batch();
  const now = Date.now();
  countries.forEach((country) => {
    batch.set(countryCacheRef(country.countryCode), {
      result: {
        countryCode: country.countryCode,
        placeId: country.placeId,
        fetchedAt: country.fetchedAt,
      },
      timestamp: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + COUNTRY_PLACE_ID_CACHE_TTL_MS),
    });
  });
  await batch.commit();
}

async function lookupCountryPlaceId(countryCode) {
  const payload = await limitedFetch(
    REGION_LOOKUP_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': requireRegionLookupKey(),
      },
      body: JSON.stringify({
        identifiers: [{
          unit_code: countryCode,
          place_type: 'country',
        }],
      }),
    },
    'Google Region Lookup country ID'
  );

  const placeId = cleanPlaceId(payload?.matches?.[0]?.matchedPlaceId);
  if (!placeId) return null;
  return {
    countryCode,
    placeId,
    fetchedAt: Date.now(),
    cacheHit: false,
  };
}

async function lookupMissingCountries(countryCodes) {
  const resolved = [];
  for (const countryCode of countryCodes) {
    const country = await lookupCountryPlaceId(countryCode);
    if (country) resolved.push(country);
  }
  return resolved;
}

export const googleCountryPlaceIds = onCall(
  callableOptions({
    secrets: [GOOGLE_REGION_LOOKUP_API_KEY],
    enforceAppCheck: false,
    maxInstances: 4,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googleCountryPlaceIds);
    const countryCodes = [];
    const seen = new Set();

    for (const item of Array.isArray(request.data?.countries) ? request.data.countries : []) {
      const countryCode = cleanCountryCode(item?.countryCode);
      if (!countryCode || seen.has(countryCode)) continue;
      seen.add(countryCode);
      countryCodes.push(countryCode);
      if (countryCodes.length >= MAX_COUNTRIES_PER_REQUEST) break;
    }

    if (!countryCodes.length) return { countries: [], unresolvedCountryCodes: [] };

    try {
      const cached = await readCountryCache(countryCodes);
      const fresh = cached.missing.length
        ? await lookupMissingCountries(cached.missing)
        : [];
      await writeCountryCache(fresh);

      const resolvedCodes = new Set(
        [...cached.resolved, ...fresh].map((country) => country.countryCode)
      );
      return {
        countries: [...cached.resolved, ...fresh],
        unresolvedCountryCodes: countryCodes.filter((code) => !resolvedCodes.has(code)),
      };
    } catch (error) {
      logError('Google Region Lookup country ID lookup failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible resolver los países para el mapa.');
    }
  }
);