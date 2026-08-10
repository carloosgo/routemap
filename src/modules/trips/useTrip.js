import { useCallback, useReducer } from 'react';
import {
  TRIP_ACTIONS,
  createInitialTrip,
  tripReducer,
} from './tripReducer.js';

export function useTrip(initialTrip) {
  const [trip, dispatch] = useReducer(
    tripReducer,
    initialTrip,
    createInitialTrip
  );

  const resetTrip = useCallback(
    () => dispatch({ type: TRIP_ACTIONS.reset }),
    []
  );
  const loadTrip = useCallback(
    (tripToLoad) =>
      dispatch({ type: TRIP_ACTIONS.load, trip: tripToLoad }),
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
  const addNote = useCallback(
    () => dispatch({ type: TRIP_ACTIONS.addNote }),
    []
  );
  const updateNote = useCallback(
    (id, field, value) =>
      dispatch({ type: TRIP_ACTIONS.updateNote, id, field, value }),
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
  const addSegment = useCallback(
    () => dispatch({ type: TRIP_ACTIONS.addSegment }),
    []
  );
  const removeSegment = useCallback(
    (segmentId) =>
      dispatch({ type: TRIP_ACTIONS.removeSegment, segmentId }),
    []
  );
  const reorderSegment = useCallback(
    (sourceId, targetId, placement) =>
      dispatch({
        type: TRIP_ACTIONS.reorderSegment,
        sourceId,
        targetId,
        placement,
      }),
    []
  );
  const updateSegment = useCallback(
    (segmentId, patch) =>
      dispatch({ type: TRIP_ACTIONS.updateSegment, segmentId, patch }),
    []
  );
  const updateExpenses = useCallback(
    (segmentId, expenses) =>
      dispatch({ type: TRIP_ACTIONS.updateExpenses, segmentId, expenses }),
    []
  );
  const addPlace = useCallback(
    (place) => dispatch({ type: TRIP_ACTIONS.addPlace, place }),
    []
  );
  const updatePlaceDetails = useCallback(
    (placeId, details) =>
      dispatch({ type: TRIP_ACTIONS.updatePlaceDetails, placeId, details }),
    []
  );
  const removePlace = useCallback(
    (placeId) => dispatch({ type: TRIP_ACTIONS.removePlace, placeId }),
    []
  );
  const reorderPlace = useCallback(
    (sourceId, targetId, placement) =>
      dispatch({
        type: TRIP_ACTIONS.reorderPlace,
        sourceId,
        targetId,
        placement,
      }),
    []
  );
  const upsertRouteConnection = useCallback(
    (connection) =>
      dispatch({ type: TRIP_ACTIONS.upsertRouteConnection, connection }),
    []
  );
  const removeRouteConnection = useCallback(
    (routeId) =>
      dispatch({ type: TRIP_ACTIONS.removeRouteConnection, routeId }),
    []
  );
  const setRouteConnectionVisibility = useCallback(
    (routeId, visible) =>
      dispatch({
        type: TRIP_ACTIONS.setRouteConnectionVisibility,
        routeId,
        visible,
      }),
    []
  );
  const setAllRouteConnectionsVisibility = useCallback(
    (visible) =>
      dispatch({
        type: TRIP_ACTIONS.setAllRouteConnectionsVisibility,
        visible,
      }),
    []
  );

  return {
    trip,
    resetTrip,
    loadTrip,
    renameTrip,
    setCurrency,
    addNote,
    updateNote,
    removeNote,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    addSegment,
    removeSegment,
    reorderSegment,
    updateSegment,
    updateExpenses,
    addPlace,
    updatePlaceDetails,
    removePlace,
    reorderPlace,
    upsertRouteConnection,
    removeRouteConnection,
    setRouteConnectionVisibility,
    setAllRouteConnectionsVisibility,
  };
}
