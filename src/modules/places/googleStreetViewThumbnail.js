import { config } from '../../config.js';

const STREET_VIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview';
const STREET_VIEW_SIZE = '96x64';

function cleanText(value, max = 260) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validCoordinate(value, limit) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function streetViewLocation(place) {
  const address = cleanText(place?.address);
  if (address) return address;

  const lat = validCoordinate(place?.lat, 90);
  const lon = validCoordinate(place?.lon, 180);
  if (lat !== null && lon !== null) return `${lat},${lon}`;

  return [
    cleanText(place?.name || place?.userLabel, 160),
    cleanText(place?.city, 120),
    cleanText(place?.country, 120),
  ].filter(Boolean).join(', ');
}

export function buildStreetViewThumbnailUrl(place, apiKey) {
  const key = cleanText(apiKey, 512);
  const location = streetViewLocation(place);
  if (!key || !location) return '';

  const params = new URLSearchParams({
    size: STREET_VIEW_SIZE,
    location,
    fov: '90',
    pitch: '0',
    radius: '80',
    source: 'outdoor',
    return_error_code: 'true',
    key,
  });

  // Deliberadamente no fijamos heading: Google orienta la cámara hacia la
  // ubicación indicada desde el panorama más cercano.
  return `${STREET_VIEW_BASE}?${params.toString()}`;
}

export function googleStreetViewThumbnailUrl(place) {
  return buildStreetViewThumbnailUrl(place, config.googleMaps.webApiKey);
}
