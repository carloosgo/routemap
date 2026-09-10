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
  normalizeTripDayOffset,
  placeTripDayOffset,
  reconcilePlacesToTripCalendar,
  resolvedPlaceTripDayOffset,
  tripCalendarDays,
} from './tripGlobalDays.js';
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
  reorderTripDay: 'REORDER_TRIP_DAY',
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
  const tripDayOffset = placeTripDayOffset(place, trip);
  if (tripDayOffset != null) return `trip-day:${tripDayOffset}`;
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
  const validPairs = consecutiveRoutePairKeys(places, { ...trip, places });
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

function legacyMovePlaceToTargetGroup(places, placeId, segmentId, dayOffset) {
  const current = Array.isArray(places) ? places : [];
  const sourceIndex = current.findIndex((place) => place.id === placeId);
  if (sourceIndex < 0) return current;

  const targetKey = planningGroupKey(segmentId, dayOffset);
  if (!targetKey) return current;

  const moved = createPlace({
    ...current[sourceIndex],
    segmentId,
    dayOffset,
    tripDayOffset: null,
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

function movePlaceToTripDay(
  state,
  placeId,
  targetTripDayOffset,
  targetPlaceId = '',
  placement = 'after'
) {
  const offset = normalizeTripDayOffset(targetTripDayOffset);
  const days = tripCalendarDays(state);
  if (offset == null || !days[offset]) return state.places;

  const current = Array.isArray(state.places) ? state.places : [];
  const sourceIndex = current.findIndex((place) => place.id === placeId);
  if (sourceIndex < 0) return current;

  const moved = createPlace({
    ...current[sourceIndex],
    tripDayOffset: offset,
  });
  const remaining = current.filter((place) => place.id !== placeId);

  let insertIndex = -1;
  if (targetPlaceId) {
    const candidateIndex = remaining.findIndex((place) => place.id === targetPlaceId);
    const candidate = candidateIndex >= 0 ? remaining[candidateIndex] : null;
    if (
      candidate
      && resolvedPlaceTripDayOffset(candidate, state) === offset
    ) {
      insertIndex = candidateIndex + (placement === 'after' ? 1 : 0);
    }
  }

  if (insertIndex < 0) {
    remaining.forEach((place, index) => {
      if (resolvedPlaceTripDayOffset(place, state) === offset) {
        insertIndex = index + 1;
      }
    });
  }

  const next = [...remaining];
  next.splice(insertIndex >= 0 ? insertIndex : next.length, 0, moved);
  return next;
}

function reorderedTripDayPlaces(state, sourceOffset, targetOffset, placement) {
  const days = tripCalendarDays(state);
  const source = normalizeTripDayOffset(sourceOffset);
  const target = normalizeTripDayOffset(targetOffset);
  if (
    source == null
    || target == null
    || source === target
    || !days[source]
    || !days[target]
  ) {
    return state.places;
  }

  const order = days.map((day) => day.tripDayOffset);
  const sourceIndex = order.indexOf(source);
  order.splice(sourceIndex, 1);
  const targetIndex = order.indexOf(target);
  order.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, source);

  const destinationBySource = new Map(
    order.map((originalOffset, newOffset) => [originalOffset, newOffset])
  );

  return (state.places || [])
    .map((place, index) => {
      const currentOffset = resolvedPlaceTripDayOffset(place, state);
      const nextOffset = destinationBySource.get(currentOffset);
      return {
        index,
        offset: nextOffset == null ? currentOffset : nextOffset,
        place: createPlace({
          ...place,
          tripDayOffset: nextOffset == null ? currentOffset : nextOffset,
        }),
      };
    })
    .sort((left, right) => {
      const leftOffset = left.offset == null ? Number.MAX_SAFE_INTEGER : left.offset;
      const rightOffset = right.offset == null ? Number.MAX_SAFE_INTEGER : right.offset;
      return leftOffset - rightOffset || left.index - right.index;
    })
    .map(({ place }) => place);
}

function normalizeWithTripDays(rawTrip) {
  return reconcilePlacesToTripCalendar(normalizeTrip(rawTrip));
}

export function createInitialTrip(initialTrip) {
  return initialTrip
    ? normalizeWithTripDays(initialTrip)
    : appendSegment(createTrip());
}

export function tripReducer(state, action) {
  switch (action.type) {
    case TRIP_ACTIONS.reset:
      return appendSegment(createTrip());

    case TRIP_ACTIONS.load:
      return normalizeWithTripDays(action.trip);

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
      return reconcilePlacesToTripCalendar(touch(state, {
        originDetails: {
          ...state.originDetails,
          ...patch,
        },
      }));
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
      return reconcilePlacesToTripCalendar(touch(state, { segments: nextSegments }));
    }

    case TRIP_ACTIONS.reorderSegment:
      return reconcilePlacesToTripCalendar(reorderSegments(
        state,
        action.sourceId,
        action.targetId,
        action.placement
      ));

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
      return reconcilePlacesToTripCalendar(touch(state, { segments: updated }));
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
      const basePlace = createPlace(action.place);
      const duplicate = places.some(
        (currentPlace) => currentPlace.id === basePlace.id
      );
      const planningDays = tripPlanningDays(state.segments);
      const placeGroupKey = placePlanningGroupKey(basePlace);
      const validPlanningTarget = placeGroupKey
        ? planningDays.some((day) => day.key === placeGroupKey)
        : planningDays.length > 0;
      const tripDayOffset = resolvedPlaceTripDayOffset(basePlace, state);
      if (
        places.length >= TRIP_LIMITS.places
        || duplicate
        || !validPlanningTarget
        || tripDayOffset == null
      ) {
        return state;
      }

      const place = createPlace({
        ...basePlace,
        tripDayOffset,
      });
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
        routeConnections: pruneRouteConnections(
          reorderedTrip.routeConnections,
          reorderedTrip.places,
          reorderedTrip
        ),
      };
    }

    case TRIP_ACTIONS.movePlaceToDay: {
      const explicitTripDayOffset = normalizeTripDayOffset(action.tripDayOffset);
      if (explicitTripDayOffset != null) {
        const places = movePlaceToTripDay(
          state,
          action.placeId,
          explicitTripDayOffset,
          action.targetPlaceId,
          action.placement
        );
        if (places === state.places) return state;
        return touch(state, {
          places,
          placeOrderVersion: PLACE_ORDER_VERSION,
          routeConnections: pruneRouteConnections(state.routeConnections, places, state),
        });
      }

      const targetKey = planningGroupKey(action.segmentId, action.dayOffset);
      const validPlanningTarget = tripPlanningDays(state.segments).some(
        (day) => day.key === targetKey
      );
      if (!validPlanningTarget) return state;
      const places = legacyMovePlaceToTargetGroup(
        state.places,
        action.placeId,
        action.segmentId,
        action.dayOffset
      );
      if (places === state.places) return state;
      return touch(state, {
        places,
        placeOrderVersion: PLACE_ORDER_VERSION,
        routeConnections: pruneRouteConnections(state.routeConnections, places, state),
      });
    }

    case TRIP_ACTIONS.reorderTripDay: {
      const places = reorderedTripDayPlaces(
        state,
        action.sourceTripDayOffset,
        action.targetTripDayOffset,
        action.placement
      );
      if (places === state.places) return state;
      return touch(state, {
        places,
        placeOrderVersion: PLACE_ORDER_VERSION,
        routeConnections: pruneRouteConnections(state.routeConnections, places, state),
      });
    }

    case TRIP_ACTIONS.upsertRouteConnection: {
      const route = createSavedPlaceRoute(action.connection);
      const places = state.places || [];
      const fromPlace = places.find((place) => place.id === route.fromPlaceId);
      const toPlace = places.find((place) => place.id === route.toPlaceId);
      const fromTripDay = fromPlace ? placeTripDayOffset(fromPlace, state) : null;
      const toTripDay = toPlace ? placeTripDayOffset(toPlace, state) : null;
      const sharesResolvedDay = fromTripDay != null && fromTripDay === toTripDay;
      const sharesLegacyGroup = fromTripDay == null
        && toTripDay == null
        && samePlanningGroup(fromPlace, toPlace);
      if (
        !route.fromPlaceId
        || !route.toPlaceId
        || route.fromPlaceId === route.toPlaceId
        || !fromPlace
        || !toPlace
        || (!sharesResolvedDay && !sharesLegacyGroup)
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
