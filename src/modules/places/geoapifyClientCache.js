export const PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v3';
export const DETAIL_CACHE_KEY = 'atlas:geoapify-place-detail-cache:v1';
export const DEFAULT_MAX_PERSISTENT_CACHE_ENTRIES = 250;

const cacheRegistry = new Map();

function readEntries(storageKey) {
  const entries = new Map();
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(storageKey) || '{}');
    Object.entries(parsed).forEach(([key, entry]) => entries.set(key, entry));
  } catch {
    try {
      globalThis.localStorage?.removeItem(storageKey);
    } catch {
      // La caché local es opcional.
    }
  }
  return entries;
}

function persistCache(storageKey, entries) {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // La caché es opcional y nunca debe bloquear la aplicación.
  }
}

function normalizedLimit(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0
    ? number
    : DEFAULT_MAX_PERSISTENT_CACHE_ENTRIES;
}

function knownExpiration(entry) {
  const expiresAt = Number(entry?.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
}

function isFresh(entry, ttlMs, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return false;

  const expiresAt = knownExpiration(entry);
  if (expiresAt !== null) return now < expiresAt;

  // Compatibilidad con entradas escritas antes de guardar expiresAt.
  const timestamp = Number(entry.timestamp);
  const ttl = Number(ttlMs);
  if (!Number.isFinite(timestamp) || !Number.isFinite(ttl) || ttl <= 0) return false;
  return now - timestamp < ttl;
}

function pruneKnownExpired(entries, now = Date.now()) {
  let changed = false;
  for (const [key, entry] of entries) {
    const expiresAt = knownExpiration(entry);
    if (expiresAt !== null && now >= expiresAt) {
      entries.delete(key);
      changed = true;
    }
  }
  return changed;
}

function trimOldest(entries, maxEntries) {
  let changed = false;
  while (entries.size > maxEntries) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
    changed = true;
  }
  return changed;
}

function mergeLatestStoredEntries(storageKey, entries) {
  const stored = readEntries(storageKey);
  for (const [key, storedEntry] of stored) {
    const currentEntry = entries.get(key);
    const storedTimestamp = Number(storedEntry?.timestamp || 0);
    const currentTimestamp = Number(currentEntry?.timestamp || 0);
    if (!currentEntry || storedTimestamp > currentTimestamp) {
      entries.delete(key);
      entries.set(key, storedEntry);
    }
  }
}

function sharedEntries(storageKey) {
  if (!cacheRegistry.has(storageKey)) {
    cacheRegistry.set(storageKey, readEntries(storageKey));
  }
  return cacheRegistry.get(storageKey);
}

export function createPersistentCache(
  storageKey,
  { maxEntries = DEFAULT_MAX_PERSISTENT_CACHE_ENTRIES } = {}
) {
  const entries = sharedEntries(storageKey);
  const limit = normalizedLimit(maxEntries);
  const changed = pruneKnownExpired(entries) || trimOldest(entries, limit);
  if (changed) persistCache(storageKey, entries);

  return {
    getFresh(key, ttlMs) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (isFresh(entry, ttlMs)) return entry;

      entries.delete(key);
      persistCache(storageKey, entries);
      return null;
    },

    set(key, value, ttlMs) {
      // Otra instancia o pestaña puede haber escrito la misma caché desde la
      // última operación. Fusionar primero evita perder entradas útiles.
      mergeLatestStoredEntries(storageKey, entries);

      const now = Date.now();
      const ttl = Number(ttlMs);
      const expiresAt = Number.isFinite(ttl) && ttl > 0 ? now + ttl : undefined;

      pruneKnownExpired(entries, now);
      entries.delete(key);
      entries.set(key, {
        ...value,
        timestamp: now,
        ...(expiresAt ? { expiresAt } : {}),
      });
      trimOldest(entries, limit);
      persistCache(storageKey, entries);
      return value;
    },
  };
}
