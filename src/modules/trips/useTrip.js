import { useCallback, useReducer } from 'react';
import {
  TRIP_ACTIONS,
  createInitialTrip,
  tripReducer,
} from './tripReducer.js';

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

export function useTrip(initialTrip) {
  const [trip, dispatch] = useReducer(
    tripReducer,
    initialTrip,
    createInitialTrip
  );

  const dispatchIfChanged = useCallback((action) => {
    if (tripReducer(trip, action) === trip) return false;
    dispatch(action);
    return true;
  }, [trip]);

  const resetTrip = useCallback(() => dispatch({ type: TRIP_ACTIONS.reset }), []);
  const loadTrip = useCallback(
    (tripToLoad) => dispatch({ type: TRIP_ACTIONS.load, trip: tripToLoad }),
    []
  );
  const renameTrip = useCallback(
    (name) => dispatch({ type: TRIP_ACTIONS.rename, name }),
    []
  );
  const setCurrency = useCallback(
    (currency) => dispatch({ type: TRIP_ACTIONS.setCurrency, currency }),
    []
  );
  const updateTripDates = useCallback(
    (patch) => dispatch({ type: TRIP_ACTIONS.updateTripDates, patch }),
    []
  );
  const removeTripDay = useCallback((dateToRemove) => {
    const tripStart = parseCivilDate(trip.startDate);
    const tripEnd = parseCivilDate(trip.endDate);
    const target = parseCivilDate(dateToRemove);
    if (
      tripStart == null
      || tripEnd == null
      || target == null
      || target < tripStart
      || target > tripEnd
    ) return false;

    const segments = Array.isArray(trip.segments) ? trip.segments : [];
    const places = Array.isArray(trip.places) ? trip.places : [];
    const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

    places.forEach((place) => {
      const segment = segmentById.get(place.segmentId);
      const segmentStart = parseCivilDate(segment?.startDate);
      const segmentEnd = parseCivilDate(segment?.endDate);
      if (segmentStart == null || segmentEnd == null || target < segmentStart || target > segmentEnd) return;
      const removedOffset = Math.floor((target - segmentStart) / DAY_MS);
      const placeOffset = Number(place.dayOffset);
      if (!Number.isInteger(placeOffset) || placeOffset < 0) return;
      if (placeOffset === removedOffset) {
        dispatch({ type: TRIP_ACTIONS.removePlace, placeId: place.id });
      } else if (placeOffset > removedOffset) {
        dispatch({
          type: TRIP_ACTIONS.movePlaceToDay,
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
        dispatch({
          type: TRIP_ACTIONS.updateSegment,
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
        dispatch({
          type: TRIP_ACTIONS.updateSegment,
          segmentId: segment.id,
          patch: { startDate: '', endDate: '' },
        });
        return;
      }

      dispatch({
        type: TRIP_ACTIONS.updateSegment,
        segmentId: segment.id,
        patch: { endDate: shiftCivilDate(segment.endDate, -1) },
      });
    });

    if (tripStart === tripEnd) {
      dispatch({
        type: TRIP_ACTIONS.updateTripDates,
        patch: { startDate: '', endDate: '' },
      });
    } else {
      dispatch({
        type: TRIP_ACTIONS.updateTripDates,
        patch: { endDate: shiftCivilDate(trip.endDate, -1) },
      });
    }
    return true;
  }, [trip]);
  const updateOrigin = useCallback(
    (origin) => dispatch({ type: TRIP_ACTIONS.updateOrigin, origin }),
    []
  );
  const updateOriginDetails = useCallback(
    (patch) => dispatch({ type: TRIP_ACTIONS.updateOriginDetails, patch }),
    []
  );
  const updateOriginExpenses = useCallback(
    (expenses) => dispatch({ type: TRIP_ACTIONS.updateOriginExpenses, expenses }),
    []
  );
  const addNote = useCallback(() => dispatch({ type: TRIP_ACTIONS.addNote }), []);
  const updateNote = useCallback(
    (id, field, value) => dispatch({ type: TRIP_ACTIONS.updateNote, id, field, value }),
    []
  );
  const removeNote = useCallback(
    (id) => dispatch({ type: TRIP_ACTIONS.removeNote, id }),
    []
  );
  const addChecklistItem = useCallback(
    (text) => dispatch({ type: TRIP_ACTIONS.addChecklistItem, text }),
    []
  );
  const toggleChecklistItem = useCallback(
    (id) => dispatch({ type: TRIP_ACTIONS.toggleChecklistItem, id }),
    []
  );
  const removeChecklistItem = useCallback(
    (id) => dispatch({ type: TRIP_ACTIONS.removeChecklistItem, id }),
    []
  );
  const addSegment = useCallback(() => dispatch({ type: TRIP_ACTIONS.addSegment }), []);
  const addCity = useCallback(
    (city) => dispatchIfChanged({ type: TRIP_ACTIONS.addCity, city }),
    [dispatchIfChanged]
  );
  const removeSegment = useCallback(
    (segmentId) => {
      (trip.places || [])
        .filter((place) => place.segmentId === segmentId)
        .forEach((place) => dispatch({
          type: TRIP_ACTIONS.removePlace,
          placeId: place.id,
        }));
      dispatch({ type: TRIP_ACTIONS.removeSegment, segmentId });
    },
    [trip.places]
  );
  const reorderSegment = useCallback(
    (sourceId, targetId, placement) => dispatch({
      type: TRIP_ACTIONS.reorderSegment,
      sourceId,
      targetId,
      placement,
    }),
    []
  );
  const updateSegment = useCallback(
    (segmentId, patch) => dispatch({ type: TRIP_ACTIONS.updateSegment, segmentId, patch }),
    []
  );
  const updateExpenses = useCallback(
    (segmentId, expenses) => dispatch({ type: TRIP_ACTIONS.updateExpenses, segmentId, expenses }),
    []
  );
  const addPlace = useCallback(
    (place) => dispatchIfChanged({ type: TRIP_ACTIONS.addPlace, place }),
    [dispatchIfChanged]
  );
  const addPlaceWithCity = useCallback(
    (city, place) => dispatchIfChanged({ type: TRIP_ACTIONS.addPlaceWithCity, city, place }),
    [dispatchIfChanged]
  );
  const updatePlace = useCallback(
    (placeId, patch) => dispatch({ type: TRIP_ACTIONS.updatePlace, placeId, patch }),
    []
  );
  const removePlace = useCallback(
    (placeId) => dispatch({ type: TRIP_ACTIONS.removePlace, placeId }),
    []
  );
  const reorderPlace = useCallback(
    (sourceId, targetId, placement) => dispatch({
      type: TRIP_ACTIONS.reorderPlace,
      sourceId,
      targetId,
      placement,
    }),
    []
  );
  const movePlaceToDay = useCallback(
    (placeId, segmentId, dayOffset) => dispatch({
      type: TRIP_ACTIONS.movePlaceToDay,
      placeId,
      segmentId,
      dayOffset,
    }),
    []
  );
  const upsertRouteConnection = useCallback(
    (connection) => dispatch({ type: TRIP_ACTIONS.upsertRouteConnection, connection }),
    []
  );
  const removeRouteConnection = useCallback(
    (routeId) => dispatch({ type: TRIP_ACTIONS.removeRouteConnection, routeId }),
    []
  );
  const setRouteConnectionVisibility = useCallback(
    (routeId, visible) => dispatch({
      type: TRIP_ACTIONS.setRouteConnectionVisibility,
      routeId,
      visible,
    }),
    []
  );
  const setAllRouteConnectionsVisibility = useCallback(
    (visible) => dispatch({ type: TRIP_ACTIONS.setAllRouteConnectionsVisibility, visible }),
    []
  );

  return {
    trip,
    resetTrip,
    loadTrip,
    renameTrip,
    setCurrency,
    updateTripDates,
    removeTripDay,
    updateOrigin,
    updateOriginDetails,
    updateOriginExpenses,
    addNote,
    updateNote,
    removeNote,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    addSegment,
    addCity,
    removeSegment,
    reorderSegment,
    updateSegment,
    updateExpenses,
    addPlace,
    addPlaceWithCity,
    updatePlace,
    removePlace,
    reorderPlace,
    movePlaceToDay,
    upsertRouteConnection,
    removeRouteConnection,
    setRouteConnectionVisibility,
    setAllRouteConnectionsVisibility,
  };
}
