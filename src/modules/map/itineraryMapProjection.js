import { dominantTransport } from './routeMapModel.js';

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
  const safeSegments = (Array.isArray(segments) ? segments : [])
    .filter((segment) => projectedPlace(segment?.destination));

  if (projectedPlace(origin)) {
    return safeSegments.map((segment, index) => ({
      id: String(segment?.id || ''),
      origin: projectedPlace(index === 0
        ? origin
        : safeSegments[index - 1]?.destination || null),
      destination: projectedPlace(segment?.destination),
      expenses: projectedTransport(segment),
    }));
  }

  if (safeSegments.length === 0) return [];
  if (safeSegments.length === 1) {
    return [{
      id: String(safeSegments[0]?.id || ''),
      origin: projectedPlace(safeSegments[0]?.destination),
      destination: null,
      expenses: projectedTransport(safeSegments[0]),
    }];
  }

  return safeSegments.slice(1).map((segment, index) => ({
    id: String(segment?.id || ''),
    origin: projectedPlace(safeSegments[index]?.destination),
    destination: projectedPlace(segment?.destination),
    expenses: projectedTransport(segment),
  }));
}

export function itineraryMapProjectionSignature(origin, segments) {
  return JSON.stringify(itineraryMapProjection(origin, segments));
}
