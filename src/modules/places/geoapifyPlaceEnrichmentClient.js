import { config } from '../../config.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { DETAIL_CACHE_KEY, createPersistentCache } from './geoapifyClientCache.js';
import { geoapifyCallable as callable } from './geoapifyCallable.js';
import { loadGooglePlaceLocations } from './googlePlacesClient.js';

const enrichmentCache = createPersistentCache(DETAIL_CACHE_KEY);
const enrichmentPending = new Map();
export const PLACE_ENRICHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export function placeEnrichmentIsFresh(place) {
  const fetchedAt = new Date(place?.geoapifyDetailsAt || '').getTime();
  if (!Number.isFinite(fetchedAt)) return false;
  const age = Date.now() - fetchedAt;
  return age >= 0 && age <= PLACE_ENRICHMENT_TTL_MS;
}

async function placeWithCoordinates(place, signal) {
  if (isPlaced(place)) return place;
  if (!isGooglePlaceReference(place)) return place;
  const locations = await loadGooglePlaceLocations([place.googlePlaceId], { signal });
  const location = locations.find((item) => item.placeId === place.googlePlaceId);
  return location
    ? { ...place, lat: Number(location.lat), lon: Number(location.lon) }
    : place;
}

function enrichmentKey(place) {
  return [
    place?.googlePlaceId || place?.id || '',
    Number(place?.lat).toFixed(5),
    Number(place?.lon).toFixed(5),
  ].join(':');
}

export async function fetchGeoapifyPlaceEnrichment(place, { signal } = {}) {
  throwIfAborted(signal);
  const located = await placeWithCoordinates(place, signal);
  throwIfAborted(signal);
  if (!isPlaced(located)) throw new Error('No hay coordenadas para enriquecer este lugar.');

  const key = enrichmentKey(located);
  const cacheKey = `enrichment:${key}`;
  const cached = enrichmentCache.getFresh(cacheKey, PLACE_ENRICHMENT_TTL_MS);
  if (cached) return cached;
  if (enrichmentPending.has(key)) return enrichmentPending.get(key);

  const pending = (async () => {
    const request = callable('geoapifyPlaceEnrichment');
    const response = await request({
      lat: located.lat,
      lon: located.lon,
      name: located.name || located.userLabel || '',
      language: config.defaultLocale,
    });
    throwIfAborted(signal);
    const result = {
      website: String(response.data?.website || '').trim().slice(0, 500),
      openingHours: String(response.data?.openingHours || '').trim().slice(0, 500),
      geoapifyDetailsAt: String(response.data?.fetchedAt || new Date().toISOString()).slice(0, 40),
    };
    enrichmentCache.set(cacheKey, result);
    return result;
  })();

  enrichmentPending.set(key, pending);
  try {
    return await pending;
  } finally {
    enrichmentPending.delete(key);
  }
}
