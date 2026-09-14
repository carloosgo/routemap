import worldAtlasTopology from './data/countries-110m.js';

let worldAtlasCountries = null;

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
  if (topology?.type !== 'Topology') throw new Error('Invalid bundled world atlas payload');
  const geometries = topology?.objects?.countries?.geometries;
  if (!Array.isArray(geometries)) throw new Error('Bundled world atlas countries unavailable');
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

export async function loadWorldAtlasCountries() {
  if (!worldAtlasCountries) {
    worldAtlasCountries = decodeCountries(worldAtlasTopology);
  }
  return worldAtlasCountries;
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
