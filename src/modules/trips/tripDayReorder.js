import { createPlace, createSegment } from './tripEntities.js';
import {
  placeTripDayOffset,
  tripCalendarDays,
  tripPlanningDays,
} from './tripDayPlanning.js';

function normalizedOffset(value) {
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 ? offset : null;
}

function reorderedOffsets(dayCount, sourceOffset, targetOffset, placement) {
  const source = normalizedOffset(sourceOffset);
  const target = normalizedOffset(targetOffset);
  if (
    source == null
    || target == null
    || source >= dayCount
    || target >= dayCount
    || source === target
  ) return null;

  const order = Array.from({ length: dayCount }, (_, index) => index);
  const [moved] = order.splice(source, 1);
  const targetIndex = order.indexOf(target);
  if (targetIndex < 0) return null;
  const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
  order.splice(insertIndex, 0, moved);
  const newOffsetByOld = new Map(order.map((oldOffset, newOffset) => [oldOffset, newOffset]));
  return newOffsetByOld;
}

/**
 * Reorders itinerary day contents while chronological date slots remain fixed.
 * City ownership and place ownership never change; only their global day slots do.
 */
export function planTripDayReorder(trip, sourceOffset, targetOffset, placement = 'before') {
  const calendar = tripCalendarDays(trip);
  const mapping = reorderedOffsets(calendar.length, sourceOffset, targetOffset, placement);
  if (!mapping) return null;

  const assignments = tripPlanningDays(trip);
  const assignmentsBySegment = new Map();
  assignments.forEach((assignment) => {
    if (!assignmentsBySegment.has(assignment.segmentId)) {
      assignmentsBySegment.set(assignment.segmentId, []);
    }
    assignmentsBySegment.get(assignment.segmentId).push(assignment);
  });

  const segments = (trip.segments || []).map((segment) => {
    const segmentAssignments = assignmentsBySegment.get(segment.id) || [];
    if (!segmentAssignments.length) return segment;
    const tripDayOffsets = [...segmentAssignments]
      .sort((left, right) => left.dayOffset - right.dayOffset)
      .map((assignment) => mapping.get(assignment.tripDayOffset))
      .filter((offset) => Number.isInteger(offset));
    return createSegment({ ...segment, tripDayOffsets });
  });

  const places = (trip.places || []).map((place) => {
    const currentOffset = placeTripDayOffset(place, trip);
    if (currentOffset == null || !mapping.has(currentOffset)) return place;
    return createPlace({
      ...place,
      tripDayOffset: mapping.get(currentOffset),
    });
  });

  return { segments, places };
}
