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

export function itineraryMapProjection(origin, segments) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  return safeSegments.map((segment, index) => {
    const planeDominant = dominantTransport(segment) === 'plane';
    const legOrigin = index === 0
      ? origin
      : safeSegments[index - 1]?.destination || null;
    return {
      id: String(segment?.id || ''),
      origin: projectedPlace(legOrigin),
      destination: projectedPlace(segment?.destination),
      startDate: String(segment?.startDate || ''),
      endDate: String(segment?.endDate || ''),
      expenses: {
        transport: {
          plane: planeDominant ? 1 : 0,
          train: 0,
          bus: 0,
          taxiUber: 0,
        },
      },
    };
  });
}

export function itineraryMapProjectionSignature(origin, segments) {
  return JSON.stringify(itineraryMapProjection(origin, segments));
}
