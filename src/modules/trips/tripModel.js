import {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  createChecklistItem,
  createCity,
  createNote,
  createOriginDetails,
  createPlace as createBasePlace,
  createSegment,
  createTrip,
  isGooglePlaceReference,
  isPlaced,
  normalizeTrip as normalizeBaseTrip,
  placeForPersistence as placeForPersistenceBase,
} from './tripEntities.js';
import { normalizeTripDayOffset } from './tripGlobalDays.js';

export {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  createChecklistItem,
  createCity,
  createNote,
  createOriginDetails,
  createSegment,
  createTrip,
  isGooglePlaceReference,
  isPlaced,
};

export function createPlace(partial = {}) {
  return {
    ...createBasePlace(partial),
    tripDayOffset: normalizeTripDayOffset(partial?.tripDayOffset),
  };
}

export function placeForPersistence(rawPlace) {
  return {
    ...placeForPersistenceBase(rawPlace),
    tripDayOffset: normalizeTripDayOffset(rawPlace?.tripDayOffset),
  };
}

function rawTripDayOffsets(raw) {
  const offsets = new Map();
  const currentPlaces = Array.isArray(raw?.places) ? raw.places : [];
  const legacyPlaces = (Array.isArray(raw?.segments) ? raw.segments : [])
    .flatMap((segment) => Array.isArray(segment?.places) ? segment.places : []);

  [...currentPlaces, ...legacyPlaces].forEach((place) => {
    const id = typeof place?.id === 'string' ? place.id.trim().slice(0, 128) : '';
    if (!id) return;
    offsets.set(id, normalizeTripDayOffset(place?.tripDayOffset));
  });
  return offsets;
}

export function normalizeTrip(raw) {
  const trip = normalizeBaseTrip(raw);
  const offsets = rawTripDayOffsets(raw);
  return {
    ...trip,
    places: (trip.places || []).map((place) => ({
      ...place,
      tripDayOffset: offsets.has(place.id) ? offsets.get(place.id) : null,
    })),
  };
}

export {
  contiguousPlaceGroups,
  groupPlacesByCountry,
  insertPlaceByCountry,
  placeCountryKey,
  reorderPlaceList,
} from './placeOrdering.js';

export {
  appendSegment,
  hasSavableRoute,
  isTripSavable,
  nextSegmentDefaults,
  reorderPlaces,
  reorderSegments,
  routeStops,
  segmentCoords,
  segmentTotal,
  tripTotal,
} from './tripOperations.js';
