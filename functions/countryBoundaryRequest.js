export const COUNTRY_BOUNDARY_GEOMETRY = 'geometry_1000';
export const COUNTRY_BOUNDARY_ACCURACY_METERS = 1000;
export const COUNTRY_BOUNDARY_CACHE_VERSION = 'v3';

export function countryBoundaryCacheKey(countryCode) {
  const normalizedCode = String(countryCode || '').trim().toUpperCase();
  return `country-boundary:${COUNTRY_BOUNDARY_CACHE_VERSION}:${COUNTRY_BOUNDARY_GEOMETRY}:${normalizedCode}`;
}

export function countryBoundaryRequestParams({ lat, lon, apiKey }) {
  return new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    boundaries: 'administrative',
    geometry: COUNTRY_BOUNDARY_GEOMETRY,
    lang: 'en',
    apiKey,
  });
}
