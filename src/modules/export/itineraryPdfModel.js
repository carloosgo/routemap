import { tripTotal } from '../trips/tripModel.js';
import { tripSummary } from '../trips/tripSummaryModel.js';

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

function citySnapshot(city) {
  return {
    id: safeText(city?.id),
    name: safeText(city?.name || city?.displayName),
    country: safeText(city?.country),
    countryCode: safeText(city?.countryCode).toUpperCase(),
    lat: Number.isFinite(Number(city?.lat)) ? Number(city.lat) : null,
    lon: Number.isFinite(Number(city?.lon)) ? Number(city.lon) : null,
  };
}

export function buildItineraryPdfModel(trip = {}) {
  const segments = Array.isArray(trip.segments) ? trip.segments : [];
  const summary = tripSummary(trip);

  return {
    tripId: safeText(trip.id),
    name: safeText(trip.name),
    currency: safeText(trip.currency) || 'USD',
    total: tripTotal(trip),
    summary,
    origin: {
      ...citySnapshot(trip.origin),
      departureDate: safeText(trip.originDetails?.departureDate),
      note: safeText(trip.originDetails?.note),
    },
    stops: segments.map((segment, index) => ({
      key: safeText(segment?.id) || `segment-${index + 1}`,
      segmentId: safeText(segment?.id),
      number: index + 1,
      ...citySnapshot(segment?.destination),
      startDate: safeText(segment?.startDate),
      endDate: safeText(segment?.endDate),
      note: safeText(segment?.note),
    })),
  };
}
