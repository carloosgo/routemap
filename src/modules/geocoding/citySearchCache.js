const CITY_CACHE_KEY = 'atlas:geoapify-city-cache:v3';
const MAX_CACHE_ENTRIES = 250;

function readEntries() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(CITY_CACHE_KEY) || '{}');
    return new Map(Object.entries(parsed));
  } catch {
    try {
      globalThis.localStorage?.removeItem(CITY_CACHE_KEY);
    } catch {
      // La caché es opcional.
    }
    return new Map();
  }
}

function persist(entries) {
  try {
    globalThis.localStorage?.setItem(
      CITY_CACHE_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // La caché nunca debe bloquear el autocomplete.
  }
}

const entries = readEntries();

export function getCachedCities(key, ttlMs) {
  const entry = entries.get(key);
  if (!entry || Date.now() - Number(entry.timestamp) >= ttlMs) return null;
  return Array.isArray(entry.results) ? entry.results : null;
}

export function cacheCities(key, results) {
  if (entries.size >= MAX_CACHE_ENTRIES && !entries.has(key)) {
    entries.delete(entries.keys().next().value);
  }
  entries.set(key, { results, timestamp: Date.now() });
  persist(entries);
}
