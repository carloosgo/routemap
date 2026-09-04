import {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  appendSegment,
  createChecklistItem,
  createCity,
  createPlace,
  createSegment,
  createTrip,
  insertPlaceByCountry,
  normalizeTrip,
  reorderPlaces,
  reorderSegments,
} from './tripModel.js';
import {
  assignedPlacesForSegment,
  planningGroupKey,
  placePlanningGroupKey,
  samePlanningGroup,
  tripPlanningDays,
} from './tripDayPlanning.js';
import {
  createSavedPlaceRoute,
  savedPlaceRoutePairKey,
} from '../routes/routeModel.js';
import { sanitizeText, uid } from '../../shared/utils.js';
import {
  validateOriginDepartureDateChange,
  validateSegmentDatePatch,
} from './tripDateRules.js';

export const TRIP_ACTIONS = Object.freeze({
  reset: 'RESET',
  load: 'LOAD',
  rename: 'RENAME',
  setCurrency: 'SET_CURRENCY',
  updateOrigin: 'UPDATE_ORIGIN',
  updateOriginDetails: 'UPDATE_ORIGIN_DETAILS',
  updateOriginExpenses: 'UPDATE_ORIGIN_EXPENSES',
  addNote: 'ADD_NOTE',
  updateNote: 'UPDATE_NOTE',
  removeNote: 'REMOVE_NOTE',
  addChecklistItem: 'ADD_CHECKLIST_ITEM',
  toggleChecklistItem: 'TOGGLE_CHECKLIST_ITEM',
  removeChecklistItem: 'REMOVE_CHECKLIST_ITEM',
  addSegment: 'ADD_SEGMENT',
  removeSegment: 'REMOVE_SEGMENT',
  reorderSegment: 'REORDER_SEGMENT',
  updateSegment: 'UPDATE_SEGMENT',
  updateExpenses: 'UPDATE_EXPENSES',
  addPlace: 'ADD_PLACE',
  updatePlace: 'UPDATE_PLACE',
  removePlace: 'REMOVE_PLACE',
  reorderPlace: 'REORDER_PLACE',
  movePlaceToDay: 'MOVE_PLACE_TO_DAY',
  upsertRouteConnection: 'UPSERT_ROUTE_CONNECTION',
  removeRouteConnection: 'REMOVE_ROUTE_CONNECTION',
  setRouteConnectionVisibility: 'SET_ROUTE_CONNECTION_VISIBILITY',
  setAllRouteConnectionsVisibility: 'SET_ALL_ROUTE_CONNECTIONS_VISIBILITY',
});

function nowISO() {
  return new Date().toISOString();
}

function touch(state, patch) {
  return {
    ...state,
    ...patch,
    updatedAt: nowISO(),
  };
}

function routesWithoutPlace(routes, placeId) {
  return (routes || []).filter(
    (route) => route.fromPlaceId !== placeId && route.toPlaceId !== placeId
  );
}

function cityIdentity(city) {
  if (!city) return '';
  const id = String(city.id || '').trim();
  if (id) return `id:${id}`;
  const lat = Number(city.lat);
  const lon = Number(city.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `geo:${lat.toFixed(6)},${lon.toFixed(6)}`;
  }
  return [
    String(city.name || '').trim().toLowerCase(),
    String(city.countryCode || '').trim().toUpperCase(),
  ].join('|');
}

function movePlaceToTargetGroup(places, placeId, segmentId, dayOffset) {
  const current = Array.isArray(places) ? places : [];
  const sourceIndex = current.findIndex((place) => place.id === placeId);
  if (sourceIndex < 0) return current;

  const targetKey = planningGroupKey(segmentId, dayOffset);
  if (!targetKey) return current;

  const moved = createPlace({
    ...current[sourceIndex],
    segmentId,
    dayOffset,
  });
  const remaining = current.filter((place) => place.id !== placeId);
  let insertIndex = -1;
  remaining.forEach((place, index) => {
    if (placePlanningGroupKey(place) === targetKey) insertIndex = index;
  });

  const next = [...remaining];
  next.splice(insertIndex >= 0 ? insertIndex + 1 : next.length, 0, moved);
  return next;
}

export function createInitialTrip(initialTrip) {
  return initialTrip ? normalizeTrip(initialTrip) : appendSegment(createTrip());
}

export function tripReducer(state, action) {
  switch (action.type) {
    case TRIP_ACTIONS.reset:
      return appendSegment(createTrip());

    case TRIP_ACTIONS.load:
      return normalizeTrip(action.trip);

    case TRIP_ACTIONS.rename:
      return touch(state, { name: sanitizeText(action.name) });

    case TRIP_ACTIONS.setCurrency:
      return touch(state, { currency: action.currency });

    case TRIP_ACTIONS.updateOrigin:
      return touch(state, {
        origin: action.origin ? createCity(action.origin) : null,
      });

    case TRIP_ACTIONS.updateOriginDetails: {
      const patch = action.patch || {};
      if (Object.hasOwn(patch, 'departureDate')) {
        const validation = validateOriginDepartureDateChange(state, patch.departureDate);
        if (!validation.valid) return state;
      }
      return touch(state, {
        originDetails: {
          ...state.originDetails,
          ...patch,
        },
      });
    }

    case TRIP_ACTIONS.updateOriginExpenses:
      return touch(state, {
        originDetails: {
          ...state.originDetails,
          expenses: action.expenses,
        },
      });

    case TRIP_ACTIONS.addNote:
      return touch(state, {
        notes: [
          ...(state.notes || []),
          { id: uid(), title: '', text: '' },
        ],
      });

    case TRIP_ACTIONS.updateNote:
      return touch(state, {
        notes: (state.notes || []).map((note) =>
          note.id === action.id
            ? { ...note, [action.field]: action.value }
            : note
        ),
      });

    case TRIP_ACTIONS.removeNote:
      return touch(state, {
        notes: (state.notes || []).filter((note) => note.id !== action.id),
      });

    case TRIP_ACTIONS.addChecklistItem:
      return touch(state, {
        checklist: [
          ...(state.checklist || []),
          createChecklistItem(action.text),
        ],
      });

    case TRIP_ACTIONS.toggleChecklistItem:
      return touch(state, {
        checklist: (state.checklist || []).map((item) =>
          item.id === action.id ? { ...item, done: !item.done } : item
        ),
      });

    case TRIP_ACTIONS.removeChecklistItem:
      return touch(state, {
        checklist: (state.checklist || []).filter(
          (item) => item.id !== action.id
        ),
      });

    case TRIP_ACTIONS.addSegment:
      return appendSegment(state);

    case TRIP_ACTIONS.removeSegment: {
      if (assignedPlacesForSegment(state.places, action.segmentId).length > 0) {
        return state;
      }
      const segments = Array.isArray(state.segments) ? state.segments : [];
      const remaining = segments.filter(
        (segment) => segment.id !== action.segmentId
      );
      const nextSegments = remaining.length > 0
        ? remaining
        : [createSegment()];
      return touch(state, { segments: nextSegments });
    }

    case TRIP_ACTIONS.reorderSegment:
      return reorderSegments(
        state,
        action.sourceId,
        action.targetId,
        action.placement
      );

    case TRIP_ACTIONS.updateSegment: {
      const patch = { ...(action.patch || {}) };
      delete patch.origin;

      const currentSegment = state.segments.find(
        (segment) => segment.id === action.segmentId
      );
      const assignedPlaces = assignedPlacesForSegment(state.places, action.segmentId);
      if (
        currentSegment
        && assignedPlaces.length > 0
        && Object.hasOwn(patch, 'destination')
        && cityIdentity(patch.destination) !== cityIdentity(currentSegment.destination)
      ) {
        return state;
      }

      if (Object.hasOwn(patch, 'startDate') || Object.hasOwn(patch, 'endDate')) {
        const validation = validateSegmentDatePatch(state, action.segmentId, patch);
        if (!validation.valid) return state;
      }

      const updated = state.segments.map((segment) =>
        segment.id === action.segmentId
          ? createSegment({ ...segment, ...patch })
          : segment
      );
      return touch(state, { segments: updated });
    }

    case TRIP_ACTIONS.updateExpenses:
      return touch(state, {
        segments: state.segments.map((segment) =>
          segment.id === action.segmentId
            ? { ...segment, expenses: action.expenses }
            : segment
        ),
      });

    case TRIP_ACTIONS.addPlace: {
      const places = state.places || [];
      const place = createPlace(action.place);
      const duplicate = places.some(
        (currentPlace) => currentPlace.id === place.id
      );
      const validPlanningTarget = tripPlanningDays(state.segments).some(
        (day) => day.key === placePlanningGroupKey(place)
      );
      if (
        places.length >= TRIP_LIMITS.places
        || duplicate
        || !validPlanningTarget
      ) {
        return state;
      }

      return touch(state, {
        places: insertPlaceByCountry(places, place),
        placeOrderVersion: PLACE_ORDER_VERSION,
      });
    }

    case TRIP_ACTIONS.updatePlace: {
      const patch = action.patch || {};
      const safePatch = {};
      if (Object.hasOwn(patch, 'note')) safePatch.note = patch.note;
      if (Object.hasOwn(patch, 'userLabel')) safePatch.userLabel = patch.userLabel;
      if (Object.keys(safePatch).length === 0) return state;
      return touch(state, {
        places: (state.places || []).map((place) =>
          place.id === action.placeId
            ? createPlace({ ...place, ...safePatch, id: place.id })
            : place
        ),
      });
    }

    case TRIP_ACTIONS.removePlace:
      return touch(state, {
        places: (state.places || []).filter(
          (place) => place.id !== action.placeId
        ),
        routeConnections: routesWithoutPlace(state.routeConnections, action.placeId),
      });

    case TRIP_ACTIONS.reorderPlace: {
      const reorderedTrip = reorderPlaces(
        state,
        action.sourceId,
        action.targetId,
        action.placement
      );
      if (reorderedTrip === state) return state;
      return {
        ...reorderedTrip,
        routeConnections: routesWithoutPlace(
          reorderedTrip.routeConnections,
          action.sourceId
        ),
      };
    }

    case TRIP_ACTIONS.movePlaceToDay: {
      const targetKey = planningGroupKey(action.segmentId, action.dayOffset);
      const validPlanningTarget = tripPlanningDays(state.segments).some(
        (day) => day.key === targetKey
      );
      if (!validPlanningTarget) return state;
      const places = movePlaceToTargetGroup(
        state.places,
        action.placeId,
        action.segmentId,
        action.dayOffset
      );
      if (places === state.places) return state;
      return touch(state, {
        places,
        placeOrderVersion: PLACE_ORDER_VERSION,
        routeConnections: routesWithoutPlace(state.routeConnections, action.placeId),
      });
    }

    case TRIP_ACTIONS.upsertRouteConnection: {
      const route = createSavedPlaceRoute(action.connection);
      const places = state.places || [];
      const fromPlace = places.find((place) => place.id === route.fromPlaceId);
      const toPlace = places.find((place) => place.id === route.toPlaceId);
      if (
        !route.fromPlaceId
        || !route.toPlaceId
        || route.fromPlaceId === route.toPlaceId
        || !fromPlace
        || !toPlace
        || !samePlanningGroup(fromPlace, toPlace)
      ) {
        return state;
      }

      const routes = state.routeConnections || [];
      const pairKey = savedPlaceRoutePairKey(route);
      const existingIndex = routes.findIndex(
        (current) => savedPlaceRoutePairKey(current) === pairKey
      );
      if (existingIndex < 0 && routes.length >= TRIP_LIMITS.routeConnections) {
        return state;
      }

      const nextRoutes = [...routes];
      if (existingIndex >= 0) {
        nextRoutes[existingIndex] = {
          ...route,
          id: routes[existingIndex].id,
        };
      } else {
        nextRoutes.push(route);
      }
      return touch(state, { routeConnections: nextRoutes });
    }

    case TRIP_ACTIONS.removeRouteConnection:
      return touch(state, {
        routeConnections: (state.routeConnections || []).filter(
          (route) => route.id !== action.routeId
        ),
      });

    case TRIP_ACTIONS.setRouteConnectionVisibility:
      return touch(state, {
        routeConnections: (state.routeConnections || []).map((route) =>
          route.id === action.routeId
            ? { ...route, visible: Boolean(action.visible) }
            : route
        ),
      });

    case TRIP_ACTIONS.setAllRouteConnectionsVisibility:
      return touch(state, {
        routeConnections: (state.routeConnections || []).map((route) => ({
          ...route,
          visible: Boolean(action.visible),
        })),
      });

    default:
      return state;
  }
}
