import {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  appendSegment,
  createChecklistItem,
  createPlace,
  createTrip,
  insertPlaceByCountry,
  normalizeTrip,
  reorderPlaces,
  reorderSegments,
} from './tripModel.js';
import {
  createSavedPlaceRoute,
  savedPlaceRoutePairKey,
} from '../routes/routeModel.js';
import { sanitizeText, uid } from '../../shared/utils.js';

export const TRIP_ACTIONS = Object.freeze({
  reset: 'RESET',
  load: 'LOAD',
  rename: 'RENAME',
  setCurrency: 'SET_CURRENCY',
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
  removePlace: 'REMOVE_PLACE',
  reorderPlace: 'REORDER_PLACE',
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

    case TRIP_ACTIONS.removeSegment:
      return touch(state, {
        segments: state.segments.filter(
          (segment) => segment.id !== action.segmentId
        ),
      });

    case TRIP_ACTIONS.reorderSegment:
      return reorderSegments(
        state,
        action.sourceId,
        action.targetId,
        action.placement
      );

    case TRIP_ACTIONS.updateSegment:
      return touch(state, {
        segments: state.segments.map((segment) =>
          segment.id === action.segmentId
            ? { ...segment, ...action.patch }
            : segment
        ),
      });

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
      if (places.length >= TRIP_LIMITS.places || duplicate) return state;

      return touch(state, {
        places: insertPlaceByCountry(places, place),
        placeOrderVersion: PLACE_ORDER_VERSION,
      });
    }

    case TRIP_ACTIONS.removePlace:
      return touch(state, {
        places: (state.places || []).filter(
          (place) => place.id !== action.placeId
        ),
        routeConnections: (state.routeConnections || []).filter(
          (route) =>
            route.fromPlaceId !== action.placeId
            && route.toPlaceId !== action.placeId
        ),
      });

    case TRIP_ACTIONS.reorderPlace:
      return reorderPlaces(
        state,
        action.sourceId,
        action.targetId,
        action.placement
      );

    case TRIP_ACTIONS.upsertRouteConnection: {
      const route = createSavedPlaceRoute(action.connection);
      const placeIds = new Set((state.places || []).map((place) => place.id));
      if (
        !route.fromPlaceId
        || !route.toPlaceId
        || route.fromPlaceId === route.toPlaceId
        || !placeIds.has(route.fromPlaceId)
        || !placeIds.has(route.toPlaceId)
        || !route.geometry
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
