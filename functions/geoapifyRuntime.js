import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { createSharedCache } from './sharedCache.js';

initializeApp();

export const db = getFirestore();
export const GEOAPIFY_API_KEY = defineSecret('GEOAPIFY_API_KEY');
export const GEOAPIFY_CITY_API_KEY = defineSecret('GEOAPIFY_CITY_API_KEY');
export const GOOGLE_PLACES_API_KEY = defineSecret('GOOGLE_PLACES_API_KEY');
export const GOOGLE_ROUTES_API_KEY = defineSecret('GOOGLE_ROUTES_API_KEY');
export const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const BATCH_JOB_TTL_MS = 24 * 60 * 60 * 1000;
export const COUNTRY_BOUNDARY_CACHE_MAX_BYTES = 850 * 1024;
export const ALLOWED_MODES = new Set([
  'drive',
  'bus',
  'bicycle',
  'walk',
  'transit',
  'approximated_transit',
]);
export const cached = createSharedCache(db, { ttlMs: CACHE_TTL_MS });

export const QUOTAS = Object.freeze({
  cityAutocomplete: { scope: 'geoapify-city-autocomplete', maxRequests: 20, windowMs: 60_000 },
  placeSearch: { scope: 'geoapify-place-search', maxRequests: 30, windowMs: 60_000 },
  autocomplete: { scope: 'geoapify-autocomplete', maxRequests: 30, windowMs: 60_000 },
  placeDetails: { scope: 'geoapify-place-details', maxRequests: 30, windowMs: 60_000 },
  route: { scope: 'geoapify-route', maxRequests: 20, windowMs: 60_000 },
  reverse: { scope: 'geoapify-reverse', maxRequests: 20, windowMs: 60_000 },
  googlePlaceAutocomplete: { scope: 'google-place-autocomplete', maxRequests: 40, windowMs: 60_000 },
  googlePlaceDetails: { scope: 'google-place-details', maxRequests: 30, windowMs: 60_000 },
  googlePlaceSearch: { scope: 'google-place-search', maxRequests: 12, windowMs: 60_000 },
  googlePlaceLocations: { scope: 'google-place-locations', maxRequests: 12, windowMs: 60_000 },
  googleCountryPlaceIds: { scope: 'google-country-place-ids', maxRequests: 8, windowMs: 60_000 },
  googleRoute: { scope: 'google-route', maxRequests: 30, windowMs: 60_000 },
  batchSubmit: {
    scope: 'geoapify-batch-submit',
    maxRequests: 2,
    windowMs: 60 * 60_000,
  },
  batchResult: {
    scope: 'geoapify-batch-result',
    maxRequests: 30,
    windowMs: 60 * 60_000,
  },
  countryBoundary: { scope: 'country-boundary', maxRequests: 10, windowMs: 60_000 },
});