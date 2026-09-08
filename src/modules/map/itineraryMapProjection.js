import { dominantTransport } from './routeMapModel.js';
import { isPlaced } from '../trips/tripModel.js';

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function projectedPlace(place) {
  if (!place || typeof place !== 'object') return null;
  return {
    id: String(place.id || ''),
    name: String(place.name || ''),
    displayName: String(place.displayName || ''),
    country: String(place.country || ''),
    countryCode: String(place.countryCode || ''),
    lat: finiteCoordinate(place.lat),
    lon: finiteCoordinate(place.lon),
  };
}

function projectedTransport(segment) {
  const planeDominant = dominantTransport(segment) === 'plane';
  return {
    transport: {
      plane: planeDominant ? 1 : 0,
      train: 0,
      bus: 0,
      taxiUber: 0,
    },
  };
}

export function itineraryMapProjection(origin, segments) {
  // Preserve every canonical segment, including partially entered legacy rows.
  // Null/empty coordinates stay null instead of becoming 0,0; downstream map
  // feature builders remain responsible for deciding which geometry is drawable.
  const safeSegments = Array.isArray(segments) ? segments : [];

  if (isPlaced(origin)) {
    return safeSegments.map((segment, index) => ({
      id: String(segment?.id || ''),
      origin: projectedPlace(index === 0
        ? origin
        : safeSegments[index - 1]?.destination || null),
      destination: projectedPlace(segment?.destination),
      expenses: projectedTransport(segment),
    }));
  }

  // New unified flow: every segment is a city. The first city is represented as
  // a destination without a preceding origin, so the existing itinerary renderer
  // can number/mark it without resurrecting the old special-origin semantics.
  return safeSegments.map((segment, index) => ({
    id: String(segment?.id || ''),
    origin: index === 0
      ? null
      : projectedPlace(safeSegments[index - 1]?.destination),
    destination: projectedPlace(segment?.destination),
    expenses: projectedTransport(segment),
  }));
}

export function itineraryMapProjectionSignature(origin, segments) {
  return JSON.stringify(itineraryMapProjection(origin, segments));
}
