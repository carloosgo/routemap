const ROUTE_MODES = new Set(['drive', 'transit', 'walk', 'bicycle', 'plane']);
const MAX_ROUTE_POINTS = 20_000;
const MAX_GEOMETRY_JSON_LENGTH = 1_500_000;

function finiteCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function validPoint(point) {
  return Boolean(
    point
      && finiteCoordinate(point.lat, -90, 90) !== null
      && finiteCoordinate(point.lon, -180, 180) !== null
  );
}

function parseGeometry(value) {
  if (typeof value !== 'string') return value;
  if (!value || value.length > MAX_GEOMETRY_JSON_LENGTH) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeRouteGeometry(value) {
  const geometry = parseGeometry(value);
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  if (geometry.coordinates.length < 2 || geometry.coordinates.length > MAX_ROUTE_POINTS) {
    return null;
  }

  const coordinates = [];
  for (const coordinate of geometry.coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const lon = finiteCoordinate(coordinate[0], -180, 180);
    const lat = finiteCoordinate(coordinate[1], -90, 90);
    if (lon === null || lat === null) return null;
    coordinates.push([lon, lat]);
  }

  return { type: 'LineString', coordinates };
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function normalizeSegmentRoute(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const geometry = normalizeRouteGeometry(raw.geometry ?? raw.geometryJson);
  const mode = ROUTE_MODES.has(raw.mode) ? raw.mode : '';
  const signature = typeof raw.signature === 'string' ? raw.signature.trim().slice(0, 180) : '';
  if (!geometry || !mode || !signature) return null;

  return {
    geometry,
    distance: nonNegativeNumber(raw.distance),
    duration: nonNegativeNumber(raw.duration),
    mode,
    signature,
    calculatedAt:
      typeof raw.calculatedAt === 'string' && raw.calculatedAt
        ? raw.calculatedAt.slice(0, 40)
        : '',
    source: raw.source === 'local' ? 'local' : 'geoapify',
  };
}

export function routeModeForSegment(segment) {
  const transport = segment?.expenses?.transport || {};
  const candidates = [
    { mode: 'plane', amount: Number(transport.plane) || 0 },
    { mode: 'transit', amount: Number(transport.train) || 0 },
    { mode: 'transit', amount: Number(transport.bus) || 0 },
    { mode: 'drive', amount: Number(transport.taxiUber) || 0 },
  ];
  const top = candidates.reduce((current, candidate) =>
    candidate.amount > current.amount ? candidate : current
  );
  return top.amount > 0 ? top.mode : 'drive';
}

export function segmentRouteSignature(segment, mode = routeModeForSegment(segment)) {
  if (!validPoint(segment?.origin) || !validPoint(segment?.destination)) return '';
  return `${Number(segment.origin.lat).toFixed(6)},${Number(segment.origin.lon).toFixed(6)}|${Number(segment.destination.lat).toFixed(6)},${Number(segment.destination.lon).toFixed(6)}|${mode}`;
}

export function hasReusableSegmentRoute(segment) {
  const route = normalizeSegmentRoute(segment?.route);
  const currentMode = routeModeForSegment(segment);
  const signature = segmentRouteSignature(segment, currentMode);
  return Boolean(
    route
      && route.mode === currentMode
      && signature
      && route.signature === signature
  );
}

export function invalidateStaleSegmentRoute(segment) {
  if (!segment?.route) return segment;
  return hasReusableSegmentRoute(segment) ? segment : { ...segment, route: null };
}

export function adaptiveRouteCoordinates(origin, destination, steps = 80) {
  if (!validPoint(origin) || !validPoint(destination)) return [];
  const start = [Number(origin.lon), Number(origin.lat)];
  const end = [Number(destination.lon), Number(destination.lat)];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.sqrt((dx * dx) + (dy * dy));
  if (distance < 1.25 || distance > 24) return [start, end];

  const factor = Math.max(0.06, Math.min(0.2, 0.19 - (Math.max(0, distance - 2) * 0.008)));
  const offset = Math.min(distance * factor, 3.25);
  const middleX = (start[0] + end[0]) / 2;
  const middleY = (start[1] + end[1]) / 2;
  const length = distance || 1;
  const controlX = middleX + ((dy / length) * offset);
  const controlY = middleY + ((-dx / length) * offset);
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const time = index / steps;
    const remaining = 1 - time;
    points.push([
      (remaining * remaining * start[0]) + (2 * remaining * time * controlX) + (time * time * end[0]),
      (remaining * remaining * start[1]) + (2 * remaining * time * controlY) + (time * time * end[1]),
    ]);
  }

  return points;
}

function haversineDistance(origin, destination) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const lat1 = toRadians(Number(origin.lat));
  const lat2 = toRadians(Number(destination.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(Number(destination.lon) - Number(origin.lon));
  const value =
    (Math.sin(deltaLat / 2) ** 2)
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLon / 2) ** 2));
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function createDirectSegmentRoute(segment) {
  const mode = routeModeForSegment(segment);
  const signature = segmentRouteSignature(segment, mode);
  const coordinates = adaptiveRouteCoordinates(segment?.origin, segment?.destination);
  if (!signature || coordinates.length < 2) return null;

  return {
    geometry: { type: 'LineString', coordinates },
    distance: haversineDistance(segment.origin, segment.destination),
    duration: 0,
    mode,
    signature,
    calculatedAt: new Date().toISOString(),
    source: 'local',
  };
}

export function routeGeometryForDisplay(segment) {
  if (hasReusableSegmentRoute(segment)) {
    return normalizeSegmentRoute(segment.route).geometry;
  }
  const coordinates = adaptiveRouteCoordinates(segment?.origin, segment?.destination);
  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
}

export function serializeRouteForFirestore(route) {
  const normalized = normalizeSegmentRoute(route);
  if (!normalized) return null;
  return { ...normalized, geometry: JSON.stringify(normalized.geometry) };
}
