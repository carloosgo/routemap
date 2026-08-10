import { config } from '../../config.js';
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

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
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
