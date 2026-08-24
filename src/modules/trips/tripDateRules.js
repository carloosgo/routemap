const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const TRIP_DATE_ERRORS = Object.freeze({
  invalidDate: 'tripInvalidDate',
  beforeOrigin: 'tripDateBeforeOrigin',
  originAfterItinerary: 'tripOriginDateAfterItinerary',
  startAfterEnd: 'tripSegmentStartAfterEnd',
  endBeforeStart: 'tripSegmentEndBeforeStart',
  beforePrevious: 'tripDateBeforePreviousSegment',
  afterNext: 'tripDateAfterNextSegment',
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function isTripISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;
  return new Date(timestamp).toISOString().slice(0, 10) === value;
}

function comparableDate(value) {
  return isTripISODate(value) ? value : '';
}

function createDateSlots(trip) {
  const slots = [
    {
      type: 'origin',
      field: 'departureDate',
      value: trip?.originDetails?.departureDate || '',
    },
  ];

  for (const [segmentIndex, segment] of (trip?.segments || []).entries()) {
    slots.push({
      type: 'segment',
      segmentId: segment.id,
      segmentIndex,
      field: 'startDate',
      value: segment.startDate || '',
    });
    slots.push({
      type: 'segment',
      segmentId: segment.id,
      segmentIndex,
      field: 'endDate',
      value: segment.endDate || '',
    });
  }

  return slots;
}

function previousComparableSlot(slots, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (comparableDate(slots[cursor].value)) return slots[cursor];
  }
  return null;
}

function nextComparableSlot(slots, index) {
  for (let cursor = index + 1; cursor < slots.length; cursor += 1) {
    if (comparableDate(slots[cursor].value)) return slots[cursor];
  }
  return null;
}

function beforeError(current, previous) {
  if (previous?.type === 'origin') return TRIP_DATE_ERRORS.beforeOrigin;
  if (
    current?.field === 'endDate'
    && previous?.segmentId === current.segmentId
    && previous?.field === 'startDate'
  ) {
    return TRIP_DATE_ERRORS.endBeforeStart;
  }
  return TRIP_DATE_ERRORS.beforePrevious;
}

function afterError(current, next) {
  if (current?.type === 'origin') return TRIP_DATE_ERRORS.originAfterItinerary;
  if (
    current?.field === 'startDate'
    && next?.segmentId === current.segmentId
    && next?.field === 'endDate'
  ) {
    return TRIP_DATE_ERRORS.startAfterEnd;
  }
  return TRIP_DATE_ERRORS.afterNext;
}

function validateChangedSlots(slots, changedIndexes) {
  const originDate = comparableDate(slots[0]?.value);

  for (const index of changedIndexes) {
    const current = slots[index];
    const value = current?.value || '';

    // Clearing a date is always valid; it removes a constraint instead of adding one.
    if (!value) continue;
    if (!isTripISODate(value)) {
      return { valid: false, errorKey: TRIP_DATE_ERRORS.invalidDate };
    }

    // Origin is the authoritative lower boundary for every dated leg.
    if (current.type === 'segment' && originDate && value < originDate) {
      return { valid: false, errorKey: TRIP_DATE_ERRORS.beforeOrigin };
    }

    const previous = previousComparableSlot(slots, index);
    if (previous && value < previous.value) {
      return { valid: false, errorKey: beforeError(current, previous) };
    }

    const next = nextComparableSlot(slots, index);
    if (next && value > next.value) {
      return { valid: false, errorKey: afterError(current, next) };
    }
  }

  return { valid: true, errorKey: '' };
}

export function validateOriginDepartureDateChange(trip, departureDate) {
  const slots = createDateSlots(trip);
  slots[0] = { ...slots[0], value: departureDate || '' };
  return validateChangedSlots(slots, [0]);
}

export function validateSegmentDatePatch(trip, segmentId, patch) {
  const changesStart = hasOwn(patch, 'startDate');
  const changesEnd = hasOwn(patch, 'endDate');
  if (!changesStart && !changesEnd) return { valid: true, errorKey: '' };

  const slots = createDateSlots(trip);
  const startIndex = slots.findIndex(
    (slot) => slot.segmentId === segmentId && slot.field === 'startDate'
  );
  if (startIndex < 0) return { valid: true, errorKey: '' };
  const endIndex = startIndex + 1;
  const changedIndexes = [];

  if (changesStart) {
    slots[startIndex] = { ...slots[startIndex], value: patch.startDate || '' };
    changedIndexes.push(startIndex);
  }
  if (changesEnd) {
    slots[endIndex] = { ...slots[endIndex], value: patch.endDate || '' };
    changedIndexes.push(endIndex);
  }

  return validateChangedSlots(slots, changedIndexes);
}

export function tripBoundaryDates(tripOrSegments) {
  const trip = Array.isArray(tripOrSegments)
    ? { segments: tripOrSegments }
    : (tripOrSegments || {});
  const segments = Array.isArray(trip.segments) ? trip.segments : [];

  let startDate = comparableDate(trip.originDetails?.departureDate);
  if (!startDate) {
    const firstStart = segments.find((segment) => comparableDate(segment?.startDate));
    startDate = comparableDate(firstStart?.startDate);
  }
  if (!startDate) {
    const firstEnd = segments.find((segment) => comparableDate(segment?.endDate));
    startDate = comparableDate(firstEnd?.endDate);
  }

  let endDate = '';
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = comparableDate(segments[index]?.endDate);
    if (candidate) {
      endDate = candidate;
      break;
    }
  }

  return { startDate, endDate };
}
