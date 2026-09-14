const WORLD_ATLAS_URLS = Object.freeze([
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
]);

let worldAtlasPromise = null;

function withTimeout(promise, milliseconds, message) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), milliseconds);
    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function decodeArc(topology, arcIndex) {
  const index = arcIndex < 0 ? ~arcIndex : arcIndex;
  const source = topology.arcs?.[index];
  if (!Array.isArray(source)) return [];

  const scale = topology.transform?.scale || [1, 1];
  const translate = topology.transform?.translate || [0, 0];
  let x = 0;
  let y = 0;
  const points = source.map(([deltaX = 0, deltaY = 0]) => {
    x += deltaX;
    y += deltaY;
    return [
      (x * scale[0]) + translate[0],
      (y * scale[1]) + translate[1],
    ];
  });

  return arcIndex < 0 ? points.reverse() : points;
}

function decodeRing(topology, arcIndexes) {
  const ring = [];
  (Array.isArray(arcIndexes) ? arcIndexes : []).forEach((arcIndex) => {
    const points = decodeArc(topology, arcIndex);
    if (!points.length) return;
    ring.push(...(ring.length ? points.slice(1) : points));
  });
  return ring;
}

function geometryPolygons(topology, geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return [(geometry.arcs || []).map((ring) => decodeRing(topology, ring))];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.arcs || []).map((polygon) => (
      polygon.map((ring) => decodeRing(topology, ring))
    ));
  }
  return [];
}

function polygonBounds(polygons) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  polygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([lon, lat]) => {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
    });
  });
  return Number.isFinite(minLon)
    ? { minLon, maxLon, minLat, maxLat }
    : null;
}

function decodeCountries(topology) {
  const geometries = topology?.objects?.countries?.geometries;
  if (!Array.isArray(geometries)) throw new Error('World atlas countries unavailable');
  return geometries.map((geometry, index) => {
    const polygons = geometryPolygons(topology, geometry);
    return {
      id: String(geometry.id ?? index),
      name: String(geometry.properties?.name || ''),
      polygons,
      bounds: polygonBounds(polygons),
    };
  }).filter((country) => country.polygons.length && country.bounds);
}

async function fetchAtlas(url) {
  if (typeof globalThis.fetch !== 'function') throw new Error('Fetch unavailable');
  const response = await withTimeout(
    globalThis.fetch(url, { cache: 'force-cache', mode: 'cors' }),
    9000,
    'World atlas request timed out'
  );
  if (!response?.ok) throw new Error(`World atlas request failed (${response?.status || 0})`);
  const topology = await withTimeout(response.json(), 5000, 'World atlas decode timed out');
  if (topology?.type !== 'Topology') throw new Error('Invalid world atlas payload');
  return decodeCountries(topology);
}

export async function loadWorldAtlasCountries() {
  if (!worldAtlasPromise) {
    worldAtlasPromise = (async () => {
      let lastError = null;
      for (const url of WORLD_ATLAS_URLS) {
        try {
          return await fetchAtlas(url);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('World atlas unavailable');
    })().catch((error) => {
      worldAtlasPromise = null;
      throw error;
    });
  }
  return worldAtlasPromise;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] || [];
    const [xj, yj] = ring[j] || [];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersects = ((yi > y) !== (yj > y))
      && (x < (((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON)) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  const [outer, ...holes] = polygon;
  if (!outer?.length || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => hole?.length && pointInRing(point, hole));
}

export function findCountryContainingPoint(countries, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  for (const country of Array.isArray(countries) ? countries : []) {
    const bounds = country.bounds;
    if (!bounds) continue;
    if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) continue;
    if (country.polygons.some((polygon) => pointInPolygon([lon, lat], polygon))) return country;
  }
  return null;
}
