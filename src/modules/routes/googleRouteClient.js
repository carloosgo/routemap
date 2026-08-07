import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { normalizeSavedPlaceRouteMode } from './routeModel.js';

const pendingRoutes = new Map();

function waypointFor(place) {
  if (isGooglePlaceReference(place)) {
    return { placeId: place.googlePlaceId };
  }
  if (isPlaced(place)) {
    return { lat: place.lat, lon: place.lon };
  }
  return null;
}

function waypointKey(waypoint) {
  if (waypoint?.placeId) return `place:${waypoint.placeId}`;
  if (Number.isFinite(waypoint?.lat) && Number.isFinite(waypoint?.lon)) {
    return `coords:${Number(waypoint.lat).toFixed(6)},${Number(waypoint.lon).toFixed(6)}`;
  }
  return '';
}

export async function requestGooglePlaceRoute(origin, destination, mode = 'drive') {
  const originWaypoint = waypointFor(origin);
  const destinationWaypoint = waypointFor(destination);
  if (!originWaypoint || !destinationWaypoint) {
    throw new TypeError('Se requieren dos lugares válidos para calcular la ruta.');
  }

  const normalizedMode = normalizeSavedPlaceRouteMode(mode);
  const key = `${waypointKey(originWaypoint)}>${waypointKey(destinationWaypoint)}:${normalizedMode}`;
  if (pendingRoutes.has(key)) return pendingRoutes.get(key);

  const pending = (async () => {
    const request = firebaseCallable('googleRoute');
    const response = await request({
      origin: originWaypoint,
      destination: destinationWaypoint,
      mode: normalizedMode,
    });
    const route = response.data || {};
    if (!route.geometry) throw new Error('Google Routes no devolvió geometría para la ruta.');
    return {
      provider: 'google',
      mode: normalizeSavedPlaceRouteMode(route.mode || normalizedMode),
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
      geometry: route.geometry,
      calculatedAt: String(route.calculatedAt || ''),
      transitSteps: Array.isArray(route.transitSteps) ? route.transitSteps : [],
    };
  })();

  pendingRoutes.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingRoutes.delete(key);
  }
}
