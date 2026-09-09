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
  normalizeTripDate,
  reorderPlaces,
  reorderSegments,
} from './tripModel.js';
import {
  assignedPlacesForSegment,
  placePlanningGroupKey,
  placeTripDayOffset,
  samePlanningGroup,
  segmentPlanningDayCount,
  tripCalendarDays,
  tripPlanningDays,
} from './tripDayPlanning.js';
import { planTripDayReorder } from './tripDayReorder.js';
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
  updateTripDates: 'UPDATE_TRIP_DATES',
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
  addCity: 'ADD_CITY',
  removeSegment: 'REMOVE_SEGMENT',
  reorderSegment: 'REORDER_SEGMENT',
  reorderTripDay: 'REORDER_TRIP_DAY',
  updateSegment: 'UPDATE_SEGMENT',
  updateExpenses: 'UPDATE_EXPENSES',
  addPlace: 'ADD_PLACE',
  addPlaceWithCity: 'ADD_PLACE_WITH_CITY',
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

function placeRouteGroupKey(place, trip) {
  const tripOffset = placeTripDayOffset(place, trip);
  if (tripOffset != null) return `trip:${tripOffset}`;
  return placePlanningGroupKey(place);
}

function consecutiveRoutePairKeys(places, trip) {
  const byGroup = new Map();
  (Array.isArray(places) ? places : []).forEach((place) => {
    const key = placeRouteGroupKey(place, trip);
    if (!key) return;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(place);
  });

  const pairs = new Set();
  byGroup.forEach((groupPlaces) => {
    for (let index = 0; index < groupPlaces.length - 1; index += 1) {
      pairs.add(`${groupPlaces[index].id}\u0000${groupPlaces[index + 1].id}`);
    }
  });
  return pairs;
}

function pruneRouteConnections(routes, places, trip) {
  const validPairs = consecutiveRoutePairKeys(places, trip);
  return (routes || []).filter((route) => validPairs.has(savedPlaceRoutePairKey(route)));
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

function ensureCitySegment(state, city) {
  const destination = createCity(city);
  const identity = cityIdentity(destination);
  if (!identity) return null;

  const segments = Array.isArray(state.segments) ? state.segments : [];
  const existing = segments.find(
    (segment) => cityIdentity(segment?.destination) === identity
  );
  if (existing) return { segments, segment: existing, changed: false };

  const reusableIndex = segments.findIndex(
    (segment) => !cityIdentity(segment?.destination)
      && assignedPlacesForSegment(state.places, segment.id).length === 0
  );

  if (reusableIndex >= 0) {
    const segment = createSegment({
      ...segments[reusableIndex],
      destination,
      startDate: '',
      endDate: '',
    });
    const nextSegments = [...segments];
    nextSegments[reusableIndex] = segment;
    return { segments: nextSegments, segment, changed: true };
  }

  if (segments.length >= TRIP_LIMITS.segments) return null;
  const segment = createSegment({ destination, startDate: '', endDate: '' });
  return { segments: [...segments, segment], segment, changed: true };
}

function movePlaceToGlobalDay(places, placeId, tripDayOffset, trip) {
  const current = Array.isArray(places) ? places : [];
  const sourceIndex = current.findIndex((place) => place.id === placeId);
  if (sourceIndex < 0) return current;
  const targetOffset = Number(tripDayOffset);
  if (!Number.isInteger(targetOffset) || targetOffset < 0) return current;

  const moved = createPlace({
    ...current[sourceIndex],
    tripDayOffset: targetOffset,
  });
  const remaining = current.filter((place) => place.id !== placeId);
  let insertIndex = -1;
  remaining.forEach((place, index) => {
    if (placeTripDayOffset(place, trip) === targetOffset) insertIndex = index;
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

    case TRIP_ACTIONS.updateTripDates: {
      const patch = action.patch || {};
      const startDate = Object.hasOwn(patch, 'startDate')
        ? normalizeTripDate(patch.startDate)
        : state.startDate || '';
      const endDate = Object.hasOwn(patch, 'endDate')
        ? normalizeTripDate(patch.endDate)
        : state.endDate || '';
      if (startDate && endDate && startDate > endDate) return state;
      if (startDate === state.startDate && endDate === state.endDate) return state;
      return touch(state, { startDate, endDate });
    }

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
        notes: [...(state.notes || []), { id: uid(), title: '', text: '' }],
      });

    case TRIP_ACTIONS.updateNote:
      return touch(state, {
        notes: (state.notes || []).map((note) =>
          note.id === action.id ? { ...note, [action.field]: action.value } : note
        ),
      });

    case TRIP_ACTIONS.removeNote:
      return touch(state, {
        notes: (state.notes || []).filter((note) => note.id !== action.id),
      });

    case TRIP_ACTIONS.addChecklistItem:
      return touch(state, {
        checklist: [...(state.checklist || []), createChecklistItem(action.text)],
      });

    case TRIP_ACTIONS.toggleChecklistItem:
      return touch(state, {
        checklist: (state.checklist || []).map((item) =>
          item.id === action.id ? { ...item, done: !item.done } : item
        ),
      });

    case TRIP_ACTIONS.removeChecklistItem:
      return touch(state, {
        checklist: (state.checklist || []).filter((item) => item.id !== action.id),
      });

    case TRIP_ACTIONS.addSegment:
      return appendSegment(state);

    case TRIP_ACTIONS.addCity: {
      const ensured = ensureCitySegment(state, action.city);
      if (!ensured || !ensured.changed) return state;
      return touch(state, { segments: ensured.segments });
    }

    case TRIP_ACTIONS.removeSegment: {
      if (assignedPlacesForSegment(state.places, action.segmentId).length > 0) return state;
      const segments = Array.isArray(state.segments) ? state.segments : [];
      const remaining = segments.filter((segment) => segment.id !== action.segmentId);
      const nextSegments = remaining.length > 0 ? remaining : [createSegment()];
      return touch(state, { segments: nextSegments });
    }

    case TRIP_ACTIONS.reorderSegment:
      return reorderSegments(state, action.sourceId, action.targetId, action.placement);

    case TRIP_ACTIONS.reorderTripDay: {
      const plan = planTripDayReorder(
        state,
        action.sourceOffset,
        action.targetOffset,
        action.placement
      );
      if (!plan) return state;
      const plannedTrip = {
        ...state,
        segments: plan.segments,
        places: plan.places,
      };
      return touch(state, {
        segments: plan.segments,
        places: plan.places,
        routeConnections: pruneRouteConnections(
          state.routeConnections,
          plan.places,
          plannedTrip
        ),
      });
    }

    case TRIP_ACTIONS.updateSegment: {
      const patch = { ...(action.patch || {}) };
      delete patch.origin;
      const currentSegment = state.segments.find((segment) => segment.id === action.segmentId);
      const assignedPlaces = assignedPlacesForSegment(state.places, action.segmentId);
      if (
        currentSegment
        && assignedPlaces.length > 0
        && Object.hasOwn(patch, 'destination')
        && cityIdentity(patch.destination) !== cityIdentity(currentSegment.destination)
      ) return state;

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
      let place = createPlace(action.place);
      const duplicate = places.some((currentPlace) => currentPlace.id === place.id);
      const planningDays = tripPlanningDays(state);
      const placeGroupKey = placePlanningGroupKey(place);
      const assignedDay = planningDays.find((day) => day.key === placeGroupKey) || null;
      const assignedSegment = (state.segments || []).find(
        (segment) => segment.id === place.segmentId
      );
      const pendingFirstDay = Boolean(
        assignedSegment
        && place.dayOffset === 0
        && segmentPlanningDayCount(assignedSegment) === 0
      );
      const validPlanningTarget = Boolean(placeGroupKey && (assignedDay || pendingFirstDay));
      if (places.length >= TRIP_LIMITS.places || duplicate || !validPlanningTarget) return state;
      if (place.tripDayOffset == null && assignedDay) {
        place = createPlace({ ...place, tripDayOffset: assignedDay.tripDayOffset });
      }

      return touch(state, {
        places: insertPlaceByCountry(places, place),
        placeOrderVersion: PLACE_ORDER_VERSION,
      });
    }

    case TRIP_ACTIONS.addPlaceWithCity: {
      const places = state.places || [];
      if (places.length >= TRIP_LIMITS.places) return state;
      const placeCandidate = createPlace(action.place);
      if (places.some((currentPlace) => currentPlace.id === placeCandidate.id)) return state;
      const ensured = ensureCitySegment(state, action.city);
      if (!ensured) return state;
      const planningState = { ...state, segments: ensured.segments };
      const firstAssignment = tripPlanningDays(planningState).find(
        (day) => day.segmentId === ensured.segment.id
      ) || null;
      const place = createPlace({
        ...placeCandidate,
        segmentId: ensured.segment.id,
        dayOffset: 0,
        tripDayOffset: firstAssignment?.tripDayOffset ?? null,
      });
      return touch(state, {
        segments: ensured.segments,
        places: insertPlaceByCountry(places, place),
        placeOrderVersion: PLACE_ORDER_VERSION,
      });
    }

    case TRIP_ACTIONS.updatePlace: {
      const patch = action.patch || {};
      const safePatch = {};
      if (Object.hasOwn(patch, 'note')) safePatch.note = patch.note;
      if (Object.hasOwn(patch, 'userLabel')) safePatch.userLabel = patch.userLabel;
      if (Object.hasOwn(patch, 'tripDayOffset')) safePatch.tripDayOffset = patch.tripDayOffset;
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
        places: (state.places || []).filter((place) => place.id !== action.placeId),
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
        routeConnections: pruneRouteConnections(
          reorderedTrip.routeConnections,
          reorderedTrip.places,
          reorderedTrip
        ),
      };
    }

    case TRIP_ACTIONS.movePlaceToDay: {
      const targetOffset = Number(action.tripDayOffset);
      if (
        !Number.isInteger(targetOffset)
        || targetOffset < 0
        || !tripCalendarDays(state)[targetOffset]
      ) return state;
      const places = movePlaceToGlobalDay(state.places, action.placeId, targetOffset, state);
      if (places === state.places) return state;
      const movedTrip = { ...state, places };
      return touch(state, {
        places,
        placeOrderVersion: PLACE_ORDER_VERSION,
        routeConnections: pruneRouteConnections(
          state.routeConnections,
          places,
          movedTrip
        ),
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
      ) return state;

      const routes = state.routeConnections || [];
      const pairKey = savedPlaceRoutePairKey(route);
      const existingIndex = routes.findIndex(
        (current) => savedPlaceRoutePairKey(current) === pairKey
      );
      if (existingIndex < 0 && routes.length >= TRIP_LIMITS.routeConnections) return state;

      const nextRoutes = [...routes];
      if (existingIndex >= 0) {
        nextRoutes[existingIndex] = { ...route, id: routes[existingIndex].id };
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