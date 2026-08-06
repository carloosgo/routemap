export const PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v3';
export const DETAIL_CACHE_KEY = 'atlas:geoapify-place-detail-cache:v1';

function readCache(storageKey, target) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(storageKey) || '{}');
    Object.entries(parsed).forEach(([key, entry]) => target.set(key, entry));
  } catch {
    try {
      globalThis.localStorage?.removeItem(storageKey);
    } catch {
      // La caché local es opcional.
    }
  }
}

function persistCache(storageKey, target) {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(Object.fromEntries(target)));
  } catch {
    // La caché es opcional y nunca debe bloquear la aplicación.
  }
}

export function createPersistentCache(storageKey) {
  const entries = new Map();
  readCache(storageKey, entries);

  return {
    getFresh(key, ttlMs) {
      const entry = entries.get(key);
      if (!entry || Date.now() - entry.timestamp >= ttlMs) return null;
      return entry;
    },

    set(key, value) {
      entries.set(key, { ...value, timestamp: Date.now() });
      persistCache(storageKey, entries);
    },
  };
}
