const BOUNDARY_VERSION = 'v1';
const boundaryCache = new Map();
const boundaryRequests = new Map();

function normalizedCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function boundaryAssetUrl(countryCode) {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}country-boundaries/${BOUNDARY_VERSION}/${countryCode}.geojson`;
}

export function isStaticCountryBoundary(feature, expectedCountryCode = '') {
  const expected = normalizedCountryCode(expectedCountryCode);
  const actual = normalizedCountryCode(feature?.properties?.countryCode);
  return feature?.type === 'Feature'
    && ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type)
    && Array.isArray(feature?.geometry?.coordinates)
    && (!expected || !actual || actual === expected);
}

export async function getStaticCountryBoundary(countryCode) {
  const code = normalizedCountryCode(countryCode);
  if (!code) return null;

  if (boundaryCache.has(code)) return boundaryCache.get(code);
  if (boundaryRequests.has(code)) return boundaryRequests.get(code);

  const pending = (async () => {
    const response = await fetch(boundaryAssetUrl(code), {
      cache: 'force-cache',
      credentials: 'same-origin',
      headers: { Accept: 'application/geo+json, application/json' },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`No fue posible cargar el límite estático de ${code}.`);
    }

    const feature = await response.json();
    if (!isStaticCountryBoundary(feature, code)) {
      throw new Error(`El límite estático de ${code} no contiene geometría válida.`);
    }

    boundaryCache.set(code, feature);
    return feature;
  })();

  boundaryRequests.set(code, pending);
  try {
    return await pending;
  } finally {
    boundaryRequests.delete(code);
  }
}

export function clearStaticCountryBoundaryMemoryCache() {
  boundaryCache.clear();
  boundaryRequests.clear();
}
