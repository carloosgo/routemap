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
  storageDriver: allowedValue(env.VITE_STORAGE_DRIVER, ['local', 'api'], 'local'),
  apiBaseUrl: cleanString(env.VITE_API_BASE_URL),
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
    mapApiKey: cleanString(env.VITE_GEOAPIFY_MAPS_API_KEY),
    mapStyle: allowedValue(env.VITE_GEOAPIFY_MAP_STYLE, ['osm-bright', 'klokantech-basic', 'positron'], 'positron'),
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
  },
  defaultLocale: allowedValue(env.VITE_DEFAULT_LOCALE, ['es', 'en'], 'es'),
  map: {
    initialCenter: [19.4326, -99.1332],
    initialZoom: 4,
    countryBoundariesUrl: cleanString(env.VITE_COUNTRY_BOUNDARIES_PMTILES_URL),
    startColor: '#15803d',
    endColor: '#e23b3b',
  },
  segmentColors: ['#e23b3b','#2563eb','#7c3aed','#ea580c','#0891b2','#db2777','#65a30d','#ca8a04'],
};

export function colorForIndex(index) {
  const palette = config.segmentColors;
  const numericIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return palette[((numericIndex % palette.length) + palette.length) % palette.length];
}
