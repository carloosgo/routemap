import { tripPlanningDays } from './tripDayPlanning.js';

const EARTH_RADIUS_KM = 6371;
export const NEARBY_ITINERARY_CITY_MAX_KM = 120;

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function countryKey(value) {
  const code = String(value?.countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return `code:${code}`;
  const country = normalizedText(value?.country);
  return country ? `name:${country}` : '';
}

function countriesCompatible(place, destination) {
  const placeCountry = countryKey(place);
  const destinationCountry = countryKey(destination);
  return !placeCountry || !destinationCountry || placeCountry === destinationCountry;
}

function coordinates(value) {
  const lat = Number(value?.lat);
  const lon = Number(value?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function radians(value) {
  return value * Math.PI / 180;
}

export function distanceKm(left, right) {
  const source = coordinates(left);
  const target = coordinates(right);
  if (!source || !target) return Number.POSITIVE_INFINITY;

  const latDelta = radians(target.lat - source.lat);
  const lonDelta = radians(target.lon - source.lon);
  const sourceLat = radians(source.lat);
  const targetLat = radians(target.lat);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(lonDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function itineraryPlacePlanningTarget(place, segments) {
  const firstDays = tripPlanningDays(segments).filter((day) => day.dayOffset === 0);
  if (!firstDays.length) return null;

  const placeCity = normalizedText(place?.city);
  if (placeCity) {
    const exact = firstDays.find((day) =>
      countriesCompatible(place, day.destination)
      && normalizedText(day.destination?.name) === placeCity
    );
    if (exact) return { day: exact, reason: 'city', distanceKm: 0 };
  }

  const nearby = firstDays
    .filter((day) => countriesCompatible(place, day.destination))
    .map((day) => ({ day, distanceKm: distanceKm(place, day.destination) }))
    .filter(({ distanceKm: distance }) => distance <= NEARBY_ITINERARY_CITY_MAX_KM)
    .sort((left, right) =>
      left.distanceKm - right.distanceKm
      || left.day.globalDayNumber - right.day.globalDayNumber
      || left.day.segmentIndex - right.day.segmentIndex
    )[0];

  return nearby ? { ...nearby, reason: 'nearby' } : null;
}
