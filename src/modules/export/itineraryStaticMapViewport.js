export const ITINERARY_STATIC_MAP_SIZE = Object.freeze({
  width: 720,
  height: 620,
  scaleFactor: 2,
});

const TILE_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 18;
const DEFAULT_PADDING = 54;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validCoordinate(point) {
  return Boolean(
    point
    && Number.isFinite(Number(point.lat))
    && Number.isFinite(Number(point.lon))
    && Math.abs(Number(point.lat)) <= 85
    && Math.abs(Number(point.lon)) <= 180
  );
}

export function mercatorWorldPoint(lon, lat) {
  const safeLon = Number(lon) || 0;
  const safeLat = clamp(Number(lat) || 0, -85.05112878, 85.05112878);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: (safeLon + 180) / 360,
    y: 0.5 - (Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}

export function mercatorLatitude(worldY) {
  const y = 0.5 - Number(worldY);
  return 90 - ((360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI);
}

function longitudeFromWorldX(worldX) {
  return (Number(worldX) * 360) - 180;
}

function unwrapWorldX(points) {
  if (!points.length) return [];
  const values = [points[0].x];
  for (let index = 1; index < points.length; index += 1) {
    let next = points[index].x;
    const previous = values[index - 1];
    while (next - previous > 0.5) next -= 1;
    while (next - previous < -0.5) next += 1;
    values.push(next);
  }
  return values;
}

export function itineraryMapViewport(entries, {
  width = ITINERARY_STATIC_MAP_SIZE.width,
  height = ITINERARY_STATIC_MAP_SIZE.height,
  padding = DEFAULT_PADDING,
} = {}) {
  const valid = (Array.isArray(entries) ? entries : []).filter(validCoordinate);
  if (!valid.length) {
    return {
      center: { lat: 20, lon: 0 },
      zoom: 2,
      width,
      height,
      padding,
    };
  }

  const worldPoints = valid.map((entry) => mercatorWorldPoint(entry.lon, entry.lat));
  const xs = unwrapWorldX(worldPoints);
  const ys = worldPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1 / (TILE_SIZE * (2 ** MAX_ZOOM)), maxX - minX);
  const spanY = Math.max(1 / (TILE_SIZE * (2 ** MAX_ZOOM)), maxY - minY);
  const drawableWidth = Math.max(80, width - (padding * 2));
  const drawableHeight = Math.max(80, height - (padding * 2));
  const zoomX = Math.log2(drawableWidth / (TILE_SIZE * spanX));
  const zoomY = Math.log2(drawableHeight / (TILE_SIZE * spanY));
  const zoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM);
  const centerWorldX = (minX + maxX) / 2;
  const centerWorldY = (minY + maxY) / 2;
  let centerLon = longitudeFromWorldX(centerWorldX);
  while (centerLon > 180) centerLon -= 360;
  while (centerLon < -180) centerLon += 360;

  return {
    center: {
      lat: mercatorLatitude(centerWorldY),
      lon: centerLon,
    },
    zoom,
    width,
    height,
    padding,
  };
}

export function projectToStaticMap(lon, lat, viewport) {
  const width = Number(viewport?.width) || ITINERARY_STATIC_MAP_SIZE.width;
  const height = Number(viewport?.height) || ITINERARY_STATIC_MAP_SIZE.height;
  const zoom = Number(viewport?.zoom) || 2;
  const center = mercatorWorldPoint(viewport?.center?.lon, viewport?.center?.lat);
  const point = mercatorWorldPoint(lon, lat);
  let deltaX = point.x - center.x;
  while (deltaX > 0.5) deltaX -= 1;
  while (deltaX < -0.5) deltaX += 1;
  const worldPixels = TILE_SIZE * (2 ** zoom);
  return [
    (width / 2) + (deltaX * worldPixels),
    (height / 2) + ((point.y - center.y) * worldPixels),
  ];
}