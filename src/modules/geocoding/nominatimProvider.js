import { config } from '../../config.js';
import { uid } from '../../shared/utils.js';

// Proveedor de geocodificación basado en Nominatim (OpenStreetMap).
//
// IMPORTANTE PARA PRODUCCIÓN GLOBAL:
// Nominatim público tiene límite de 1 req/seg y exige atribución. NO es apto
// para tráfico mundial alto. Para escalar, elige una de estas rutas:
//   1) Auto-hospedar Nominatim (Docker) detrás de tu propio rate limit/caché.
//   2) Usar un proveedor comercial (Mapbox, Google, LocationIQ, Geoapify).
// La interfaz no cambia: solo implementa otro provider con la misma firma.
//
// Mitigación incluida aquí: debounce (en el hook), límite de resultados,
// cancelación de peticiones obsoletas (AbortController) y caché en memoria.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MAX_CACHE_ENTRIES = 100;
const MAX_QUERY_LENGTH = 200;
const MAX_RESULTS = 10;

export function createNominatimProvider() {
  const cache = new Map(); // query -> CityResult[]

  async function search(query, { signal, limit = config.citySearchLimit } = {}) {
    const q = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY_LENGTH) : '';
    if (q.length < config.citySearchMinChars) return [];

    const safeLimit = clampLimit(limit);
    const cacheKey = `${q.toLowerCase()}|${safeLimit}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    // Pedimos más resultados de los necesarios para que el filtro no deje la
    // lista vacía después de descartar POIs, amenities, etc.
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      addressdetails: '1',
      limit: String(safeLimit * 3),
      'accept-language': config.defaultLocale,
    });

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`Geocoder error ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Geocoder returned an invalid response.');

    const seen = new Set();
    const results = data
      .filter((item) => item?.lat && item?.lon && isPlace(item))
      .map((item) => normalize(item))
      .filter((item) => {
        if (!item.name || !item.countryCode) return false;
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return false;
        if (item.lat < -90 || item.lat > 90 || item.lon < -180 || item.lon > 180) return false;

        // Deduplicar por nombre normalizado + país.
        const key = `${item.name.toLowerCase()}|${item.countryCode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, safeLimit);

    remember(cache, cacheKey, results);
    return results;
  }

  return { search };
}

function clampLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed)) return config.citySearchLimit;
  return Math.min(Math.max(parsed, 1), MAX_RESULTS);
}

function remember(cache, key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, value);
}

// Solo aceptamos resultados de tipo "lugar" o "división administrativa".
// Esto filtra embajadas, monumentos, tiendas, etc.
// Con format=jsonv2 el campo se llama "category"; con format=json se llama "class".
// Leemos ambos para ser robustos ante cambios de formato.
function isPlace(item) {
  const cat = item.category || item.class;
  if (cat === 'place') return true;
  if (cat === 'boundary' && item.type === 'administrative') return true;
  return false;
}

function normalize(item) {
  const addr = item.address || {};

  const cityName =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.state ||
    item.name ||
    (item.display_name || '').split(',')[0].trim();

  const countryName = addr.country || '';

  // displayName es solo "Ciudad, País" — nunca la cadena completa de OSM.
  const displayName = countryName ? `${cityName}, ${countryName}` : cityName;

  return {
    id: item.osm_id ? `osm-${item.osm_type}-${item.osm_id}` : uid(),
    name: cityName,
    displayName,
    country: countryName,
    countryCode: (addr.country_code || '').toUpperCase(),
    lat: Number.parseFloat(item.lat),
    lon: Number.parseFloat(item.lon),
  };
}
