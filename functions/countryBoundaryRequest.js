export const COUNTRY_BOUNDARY_GEOMETRY_SOURCE = 'details.full_geometry';
export const COUNTRY_BOUNDARY_CACHE_VERSION = 'v4';

export function countryBoundaryCacheKey(countryCode) {
  const normalizedCode = String(countryCode || '').trim().toUpperCase();
  return `country-boundary:${COUNTRY_BOUNDARY_CACHE_VERSION}:${COUNTRY_BOUNDARY_GEOMETRY_SOURCE}:${normalizedCode}`;
}

// Primera etapa: localizar el objeto país y obtener su place_id sin descargar
// todavía una geometría simplificada de 1/5/10 km.
export function countryBoundaryLookupParams({ lat, lon, apiKey }) {
  return new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    boundaries: 'administrative',
    geometry: 'point',
    lang: 'en',
    apiKey,
  });
}

// Segunda etapa: solicitar la geometría original del país identificado.
export function countryBoundaryDetailsParams({ placeId, apiKey }) {
  return new URLSearchParams({
    id: String(placeId || ''),
    features: COUNTRY_BOUNDARY_GEOMETRY_SOURCE,
    lang: 'en',
    apiKey,
  });
}
