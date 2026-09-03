const env = import.meta.env || {};

function allowedValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function envBoolean(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

export const config = {
  storageKey: 'atlas:trips:v1',
  firebase: {
    apiKey: cleanString(env.VITE_FIREBASE_API_KEY),
    authDomain: cleanString(env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: cleanString(env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: cleanString(env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanString(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanString(env.VITE_FIREBASE_APP_ID),
    appCheckSiteKey: cleanString(env.VITE_FIREBASE_APPCHECK_SITE_KEY),
    useEmulators: envBoolean(env.VITE_FIREBASE_USE_EMULATORS),
  },
  citySearchMinChars: 3,
  citySearchDebounceMs: 450,
  citySearchLimit: 5,
  citySearchCacheTtlMs: 60 * 24 * 60 * 60 * 1000,
  geoapify: {
    functionRegion: cleanString(env.VITE_FIREBASE_FUNCTIONS_REGION) || 'us-central1',
    searchMinChars: 5,
    searchDebounceMs: 450,
    searchLimit: 5,
    clientCacheTtlMs: 60 * 24 * 60 * 60 * 1000,
  },
  googleMaps: {
    webApiKey: cleanString(env.VITE_GOOGLE_MAPS_API_KEY),
    mapId: cleanString(env.VITE_GOOGLE_MAPS_MAP_ID),
    searchMinChars: 4,
    searchDebounceMs: 450,
    searchLimit: 5,
    memoryCacheTtlMs: 5 * 60 * 1000,
    locationCacheKey: 'atlas:google-place-locations:v1',
    locationCacheTtlMs: 29 * 24 * 60 * 60 * 1000,
    countryPlaceIdCacheKey: 'atlas:google-country-place-ids:v4',
    countryPlaceIdCacheTtlMs: 330 * 24 * 60 * 60 * 1000,
  },
  defaultLocale: allowedValue(env.VITE_DEFAULT_LOCALE, ['es', 'en'], 'es'),
  map: {
    initialCenter: [19.4326, -99.1332],
    initialZoom: 4,
    startColor: '#15803d',
    endColor: '#e23b3b',
  },
  segmentColors: [
    '#d94f4f',
    '#3f74d8',
    '#2f9b8f',
    '#d89a2b',
    '#7b61c9',
    '#e9795b',
    '#3997b8',
    '#7e9d3a',
    '#c85b8e',
    '#b56b45',
    '#5963b8',
    '#4c956c',
    '#e6853a',
    '#c84f69',
    '#5e82a8',
    '#c9a23b',
    '#9b6ac9',
    '#3e9d79',
    '#b85f55',
    '#339f9f',
    '#4f6d9b',
    '#8a7f36',
    '#a85d83',
    '#6d8f57',
  ],
  countryColors: [
    '#e45756',
    '#3b82f6',
    '#2a9d8f',
    '#e9a23b',
    '#7b61c9',
    '#e9795b',
    '#4c956c',
    '#2d9cdb',
    '#c85b8e',
    '#8f9f36',
    '#5963b8',
    '#b5654d',
    '#35a58a',
    '#c79a2b',
    '#c84f69',
    '#4f7d5d',
    '#9b6ac9',
    '#3d8fb3',
    '#b66f3f',
    '#7da64b',
    '#4f6d9b',
    '#9a5b8e',
    '#d88762',
    '#3d9d9a',
  ],
};

function paletteColor(palette, index) {
  const numericIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return palette[((numericIndex % palette.length) + palette.length) % palette.length];
}

export function colorForIndex(index) {
  return paletteColor(config.segmentColors, index);
}

export function countryColorForIndex(index) {
  return paletteColor(config.countryColors, index);
}
