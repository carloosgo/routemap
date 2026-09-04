import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { isPlaced } from '../trips/tripModel.js';
import { normalizeSavedPlaceRouteMode } from './routeModel.js';

export async function requestSavedPlaceRoute(origin, destination, mode = 'drive') {
  if (!isPlaced(origin) || !isPlaced(destination)) {
    throw new TypeError('Se requieren dos lugares con coordenadas válidas.');
  }

  const request = firebaseCallable('geoapifyRoute');
  const response = await request({
    origin: { lat: origin.lat, lon: origin.lon },
    destination: { lat: destination.lat, lon: destination.lon },
    mode: normalizeSavedPlaceRouteMode(mode),
    estimateOnly: true,
  });
  const route = response.data || {};

  return {
    available: route.available !== false,
    mode: normalizeSavedPlaceRouteMode(route.mode || mode),
    distance: Number(route.distance) || 0,
    duration: Number(route.duration) || 0,
    geometry: route.geometry || null,
    calculatedAt: String(route.calculatedAt || ''),
  };
}
