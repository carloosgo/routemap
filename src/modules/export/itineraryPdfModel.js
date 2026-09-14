import { colorForIndex } from '../../config.js';
import { visitedCountries } from '../map/countryColoring.js';
import {
  isPlaced,
  segmentTotal,
  tripTotal,
} from '../trips/tripModel.js';
import { buildItineraryStopSequence } from '../trips/itineraryStopSequence.js';
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

function hasChosenCity(city) {
  return Boolean(
    city
    && (safeText(city.name || city.displayName).trim() || isPlaced(city))
  );
}

export function buildItineraryPdfModel(trip = {}) {
  const segments = Array.isArray(trip.segments) ? trip.segments : [];
  const summary = tripSummary(trip);
  const hasOrigin = isPlaced(trip.origin) && hasChosenCity(trip.origin);
  const presentation = buildItineraryStopSequence(trip.origin, segments, colorForIndex);
  const countries = visitedCountries(segments, colorForIndex).map(({ countryCode, city, color }) => ({
    countryCode,
    country: safeText(city?.country),
    color,
    city: citySnapshot(city),
  }));

  return {
    tripId: safeText(trip.id),
    name: safeText(trip.name),
    currency: safeText(trip.currency) || 'USD',
    total: tripTotal(trip),
    summary,
    countries,
    hasOrigin,
    origin: {
      ...citySnapshot(trip.origin),
      departureDate: safeText(trip.originDetails?.departureDate),
      note: safeText(trip.originDetails?.note),
      total: hasOrigin ? segmentTotal({ expenses: trip.originDetails?.expenses }) : 0,
    },
    stops: segments.flatMap((segment, index) => {
      if (!hasChosenCity(segment?.destination)) return [];
      const stopPresentation = presentation[index] || {};
      return [{
        key: safeText(segment?.id) || `segment-${index + 1}`,
        segmentId: safeText(segment?.id),
        number: stopPresentation.number,
        color: stopPresentation.color,
        isTerminalReturn: Boolean(stopPresentation.isTerminalReturn),
        ...citySnapshot(segment?.destination),
        startDate: safeText(segment?.startDate),
        endDate: safeText(segment?.endDate),
        note: safeText(segment?.note),
        total: segmentTotal(segment),
      }];
    }),
  };
}
