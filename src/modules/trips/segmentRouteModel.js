const ROUTABLE_MODES = new Set(['drive', 'walk', 'bicycle', 'transit']);
const STORED_MODES = new Set([...ROUTABLE_MODES, 'plane']);
const MAX_ROUTE_POINTS = 20_000;
const MAX_ROUTE_GEOMETRY_CHARS = 700_000;

function validCoordinate(value, minimum, maximum) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function validPoint(point) {
  return Boolean(
    point
      && validCoordinate(point.lat, -90, 90) !== null
      && validCoordinate(point.lon, -180, 180) !== null
  );
}

function normalizeCoordinatePair(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = validCoordinate(value[0], -180, 180);
  const lat = validCoordinate(value[1], -90, 90);
  return lon === null || lat === null ? null : [lon, lat];
}

function normalizeLine(value, budget) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const coordinates = [];
  for (const point of value) {
    const normalized = normalizeCoordinatePair(point);
    if (!normalized) return null;
    budget.count += 1;
    if (budget.count > MAX_ROUTE_POINTS) return null;
    coordinates.push(normalized);
  }
  return coordinates;
}

export function normalizeRouteGeometry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const budget = { count: 0 };

  if (value.type === 'LineString') {
    const coordinates = normalizeLine(value.coordinates, budget);
    return coordinates ? { type: 'LineString', coordinates } : null;
  }

  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates)) {
    const coordinates = [];
    for (const line of value.coordinates) {
      const normalized = normalizeLine(line, budget);
      if (!normalized) return null;
      coordinates.push(normalized);
    }
    return coordinates.length
      ? { type: 'MultiLineString', coordinates }
      : null;
  }

  return null;
}

function transportAmount(segment, key) {
  const value = Number(segment?.expenses?.transport?.[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function dominantTransport(segment) {
  const candidates = [
    { type: 'plane', amount: transportAmount(segment, 'plane') },
    { type: 'train', amount: transportAmount(segment, 'train') },
    { type: 'bus', amount: transportAmount(segment, 'bus') },
    { type: 'car', amount: transportAmount(segment, 'taxiUber') },
  ];
  const top = candidates.reduce((current, candidate) =>
    candidate.amount > current.amount ? candidate : current
  );
  return top.amount > 0 ? top.type : null;
}

export function routeModeForSegment(segment) {
  const transport = dominantTransport(segment);
  if (transport === 'plane') return 'plane';
  if (transport === 'train' || transport === 'bus') return 'transit';
  return 'drive';
}

export function routeSignatureForSegment(segment) {
  if (!validPoint(segment?.origin) || !validPoint(segment?.destination)) {
    return '';
  }
  const mode = routeModeForSegment(segment);
  return `${Number(segment.origin.lat).toFixed(6)},${Number(segment.origin.lon).toFixed(6)}|${Number(segment.destination.lat).toFixed(6)},${Number(segment.destination.lon).toFixed(6)}|${mode}`;
}

function nonNegativeMetric(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizedCalculatedAt(value) {
  if (typeof value !== 'string' || value.length > 40) return '';
  return Number.isNaN(Date.parse(value)) ? '' : value;
}

export function normalizeSegmentRoute(value, segment) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const signature = routeSignatureForSegment(segment);
  const mode = routeModeForSegment(segment);
  if (
    !signature
      || value.signature !== signature
      || value.mode !== mode
      || !STORED_MODES.has(value.mode)
  ) {
    return null;
  }

  const geometry = normalizeRouteGeometry(value.geometry);
  if (!geometry) return null;

  return {
    signature,
    mode,
    geometry,
    distance: nonNegativeMetric(value.distance),
    duration: nonNegativeMetric(value.duration),
    calculatedAt: normalizedCalculatedAt(value.calculatedAt),
  };
}

export function withSegmentRoutePatch(segment, patch = {}) {
  const next = { ...segment, ...patch };
  const route = Object.hasOwn(patch, 'route') ? patch.route : segment?.route;
  return { ...next, route: normalizeSegmentRoute(route, next) };
}

export function routeGeometryForDisplay(segment) {
  return normalizeSegmentRoute(segment?.route, segment)?.geometry || null;
}

export function isRoutableSegment(segment) {
  const signature = routeSignatureForSegment(segment);
  return Boolean(signature && ROUTABLE_MODES.has(routeModeForSegment(segment)));
}

export function serializeRouteGeometry(value) {
  const geometry = normalizeRouteGeometry(value);
  if (!geometry) return '';
  const serialized = JSON.stringify(geometry);
  return serialized.length <= MAX_ROUTE_GEOMETRY_CHARS ? serialized : '';
}

export function parseRouteGeometry(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_ROUTE_GEOMETRY_CHARS) {
    return null;
  }
  try {
    return normalizeRouteGeometry(JSON.parse(value));
  } catch {
    return null;
  }
}
