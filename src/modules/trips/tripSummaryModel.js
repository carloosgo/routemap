import { tripBoundaryDates } from './tripDateRules.js';

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
  const name = String(city.name || '').trim();
  const countryCode = String(city.countryCode || '').trim();
  if (!name && !countryCode) return '';
  return `${name}|${countryCode}`.toLowerCase();
}

function countryKey(city) {
  if (!city) return '';
  const countryCode = String(city.countryCode || '').trim().toUpperCase();
  if (countryCode) return `code:${countryCode}`;
  const country = String(city.country || '').trim().toLowerCase();
  return country ? `name:${country}` : '';
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

function globalSegmentDateRange(segments) {
  const timestamps = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    const start = validDate(segment?.startDate);
    const end = validDate(segment?.endDate);
    if (start != null) timestamps.push(start);
    if (end != null) timestamps.push(end);
  }
  if (!timestamps.length) return { startDate: '', endDate: '' };
  return {
    startDate: new Date(Math.min(...timestamps)).toISOString().slice(0, 10),
    endDate: new Date(Math.max(...timestamps)).toISOString().slice(0, 10),
  };
}

export function tripDateRange(tripOrSegments) {
  // Preserve the standalone segment-array utility contract. The trip header passes
  // the full trip object so it can use origin departure + last entered leg date.
  if (Array.isArray(tripOrSegments)) return globalSegmentDateRange(tripOrSegments);
  return tripBoundaryDates(tripOrSegments);
}

function segmentNightTotal(segments) {
  const ranges = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    const start = validDate(segment?.startDate);
    if (start == null) continue;

    const explicitEnd = validDate(segment?.endDate);
    const end = explicitEnd ?? (start + DAY_MS);
    if (end < start) continue;
    ranges.push([start, end]);
  }

  if (!ranges.length) return 0;
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let total = 0;
  let [rangeStart, rangeEnd] = ranges[0];
  for (const [start, end] of ranges.slice(1)) {
    if (start <= rangeEnd) {
      rangeEnd = Math.max(rangeEnd, end);
      continue;
    }
    total += Math.floor((rangeEnd - rangeStart) / DAY_MS);
    rangeStart = start;
    rangeEnd = end;
  }

  return total + Math.floor((rangeEnd - rangeStart) / DAY_MS);
}

function tripBoundaryNightTotal(trip) {
  const { startDate, endDate } = tripDateRange(trip);
  const start = validDate(startDate);
  const end = validDate(endDate);
  if (start == null || end == null || end <= start) return 0;

  // Header nights are a global trip metric, not a sum of per-leg stays.
  // The final destination date is a checkout/end boundary, so it is excluded by
  // the date difference itself. When the displayed start is the origin departure,
  // that origin date is also excluded because it is not a destination night.
  const calendarDaysBeforeEnd = Math.floor((end - start) / DAY_MS);
  const originDeparture = trip?.originDetails?.departureDate || '';
  const excludesOriginDeparture = startDate === originDeparture && validDate(originDeparture) != null;
  return Math.max(0, calendarDaysBeforeEnd - (excludesOriginDeparture ? 1 : 0));
}

export function tripTotalNights(tripOrSegments) {
  if (Array.isArray(tripOrSegments)) return segmentNightTotal(tripOrSegments);
  return tripBoundaryNightTotal(tripOrSegments || {});
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

export function tripCountryCount(segments) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const originCountryKey = countryKey(safeSegments[0]?.origin);
  const seen = new Set();

  for (const segment of safeSegments) {
    for (const city of [segment?.origin, segment?.destination]) {
      const key = countryKey(city);
      if (key && key !== originCountryKey) seen.add(key);
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
    ...tripDateRange(trip),
    destinations: tripDestinationCount(segments),
    countries: tripCountryCount(segments),
    nights: tripTotalNights(trip),
    distanceKm: tripTotalDistanceKm(segments),
  };
}
