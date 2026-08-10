import { config } from '../../config.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { loadGooglePlaceLocations } from './googlePlacesClient.js';
import { geoapifyCallable as callable } from './geoapifyCallable.js';
import {
  DETAIL_CACHE_KEY,
  PLACE_CACHE_KEY,
  createPersistentCache,
} from './geoapifyClientCache.js';
import { normalizeSearchKey } from './geoapifyQuery.js';

export { normalizeSearchKey } from './geoapifyQuery.js';

const placeCache = createPersistentCache(PLACE_CACHE_KEY);
const detailCache = createPersistentCache(DETAIL_CACHE_KEY);
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
    return {
      website: String(response.data?.website || '').trim().slice(0, 500),
      openingHours: String(response.data?.openingHours || '').trim().slice(0, 500),
      geoapifyDetailsAt: String(response.data?.fetchedAt || new Date().toISOString()).slice(0, 40),
    };
  })();

  enrichmentPending.set(key, pending);
  try {
    return await pending;
  } finally {
    enrichmentPending.delete(key);
  }
}

export async function searchGeoapifyPlaces(query, { signal } = {}) {
  const cleanQuery = String(query || '').trim();
  const queryKey = normalizeSearchKey(cleanQuery);
  if (queryKey.length < config.geoapify.searchMinChars) return [];

  const cached = placeCache.getFresh(queryKey, config.geoapify.clientCacheTtlMs);
  if (cached) return cached.result;

  throwIfAborted(signal);
  const request = callable('geoapifyPlaceSearch');
  const response = await request({
    query: cleanQuery,
    limit: config.geoapify.searchLimit,
  });
  throwIfAborted(signal);

  const result = Array.isArray(response.data?.results) ? response.data.results : [];
  placeCache.set(queryKey, { result });
  return result;
}

export async function fetchGeoapifyPlaceImage(place, { signal } = {}) {
  const id = String(place?.id || '').trim();
  if (!id) return '';

  const cached = detailCache.getFresh(id, config.geoapify.clientCacheTtlMs);
  if (cached) return cached.image || '';

  throwIfAborted(signal);
  const request = callable('geoapifyPlaceDetails');
  const response = await request({ placeId: id });
  throwIfAborted(signal);

  const image = String(response.data?.image || '').trim();
  detailCache.set(id, { image });
  return image;
}
