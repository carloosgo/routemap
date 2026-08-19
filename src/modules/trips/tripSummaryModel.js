const DAY_MS = 86400000;
const EARTH_RADIUS_KM = 6371.0088;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function placedCity(city) {
  return Boolean(
    city
      && Number.isFinite(city.lat)
      && Math.abs(city.lat) <= 90
      && Number.isFinite(city.lon)
      && Math.abs(city.lon) <= 180
  );
}

function cityKey(city) {
  if (!city) return '';
  if (city.id) return `id:${city.id}`;
  if (placedCity(city)) return `coord:${city.lat.toFixed(5)},${city.lon.toFixed(5)}`;
  return `${city.name || ''}|${city.countryCode || ''}`.toLowerCase();
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(from, to) {
  if (!placedCity(from) || !placedCity(to)) return 0;
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(to.lon - from.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function tripDateRange(segments) {
  const timestamps = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    const start = validDate(segment?.startDate);
    const end = validDate(segment?.endDate);
    if (start != null) timestamps.push(start);
    if (end != null) timestamps.push(end);
  }
  if (!timestamps.length) return { startDate: '', endDate: '' };
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  return {
    startDate: new Date(start).toISOString().slice(0, 10),
    endDate: new Date(end).toISOString().slice(0, 10),
  };
}

export function tripTotalNights(segments) {
  return (Array.isArray(segments) ? segments : []).reduce((sum, segment) => {
    const start = validDate(segment?.startDate);
    const end = validDate(segment?.endDate);
    if (start == null || end == null || end < start) return sum;
    return sum + Math.round((end - start) / DAY_MS);
  }, 0);
}

export function tripDestinationCount(segments) {
  const seen = new Set();
  for (const segment of Array.isArray(segments) ? segments : []) {
    for (const city of [segment?.origin, segment?.destination]) {
      const key = cityKey(city);
      if (key) seen.add(key);
    }
  }
  return seen.size;
}

export function tripTotalDistanceKm(segments) {
  return (Array.isArray(segments) ? segments : []).reduce(
    (sum, segment) => sum + haversineKm(segment?.origin, segment?.destination),
    0
  );
}

export function tripSummary(trip) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  return {
    ...tripDateRange(segments),
    destinations: tripDestinationCount(segments),
    nights: tripTotalNights(segments),
    distanceKm: tripTotalDistanceKm(segments),
  };
}
