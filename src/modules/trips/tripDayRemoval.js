const DAY_MS = 24 * 60 * 60 * 1000;

function parseCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return timestamp;
}

function shiftCivilDate(value, amount) {
  const timestamp = parseCivilDate(value);
  if (timestamp == null) return value || '';
  return new Date(timestamp + amount * DAY_MS).toISOString().slice(0, 10);
}

export function planTripDayRemoval(trip, dateToRemove) {
  const tripStart = parseCivilDate(trip?.startDate);
  const tripEnd = parseCivilDate(trip?.endDate);
  const target = parseCivilDate(dateToRemove);
  if (
    tripStart == null
    || tripEnd == null
    || target == null
    || target < tripStart
    || target > tripEnd
  ) return null;

  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  const places = Array.isArray(trip?.places) ? trip.places : [];
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const removePlaceIds = [];
  const movePlaces = [];
  const segmentPatches = [];

  places.forEach((place) => {
    const segment = segmentById.get(place.segmentId);
    const segmentStart = parseCivilDate(segment?.startDate);
    const segmentEnd = parseCivilDate(segment?.endDate);
    if (segmentStart == null || segmentEnd == null || target < segmentStart || target > segmentEnd) return;
    const removedOffset = Math.floor((target - segmentStart) / DAY_MS);
    const placeOffset = Number(place.dayOffset);
    if (!Number.isInteger(placeOffset) || placeOffset < 0) return;
    if (placeOffset === removedOffset) {
      removePlaceIds.push(place.id);
    } else if (placeOffset > removedOffset) {
      movePlaces.push({
        placeId: place.id,
        segmentId: place.segmentId,
        dayOffset: placeOffset - 1,
      });
    }
  });

  segments.forEach((segment) => {
    const segmentStart = parseCivilDate(segment?.startDate);
    const segmentEnd = parseCivilDate(segment?.endDate);
    if (segmentStart == null || segmentEnd == null) return;

    if (target < segmentStart) {
      segmentPatches.push({
        segmentId: segment.id,
        patch: {
          startDate: shiftCivilDate(segment.startDate, -1),
          endDate: shiftCivilDate(segment.endDate, -1),
        },
      });
      return;
    }

    if (target > segmentEnd) return;
    if (segmentStart === segmentEnd) {
      segmentPatches.push({
        segmentId: segment.id,
        patch: { startDate: '', endDate: '' },
      });
      return;
    }

    segmentPatches.push({
      segmentId: segment.id,
      patch: { endDate: shiftCivilDate(segment.endDate, -1) },
    });
  });

  return {
    removePlaceIds,
    movePlaces,
    segmentPatches,
    tripDatePatch: tripStart === tripEnd
      ? { startDate: '', endDate: '' }
      : { endDate: shiftCivilDate(trip.endDate, -1) },
  };
}
