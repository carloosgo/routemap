import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { isPlaced } from '../trips/tripModel.js';
import { normalizeSavedPlaceRouteMode } from './routeModel.js';

export async function requestGooglePlaceRoute(origin, destination, mode = 'drive') {
  if (!isPlaced(origin) || !isPlaced(destination)) {
    throw new TypeError('Se requieren dos lugares con coordenadas válidas.');
  }
  const request = firebaseCallable('googleRoute');
  const response = await request({
    origin: { lat: origin.lat, lon: origin.lon },
    destination: { lat: destination.lat, lon: destination.lon },
    mode: normalizeSavedPlaceRouteMode(mode),
  });
  const route = response.data || {};
  if (!route.geometry) throw new Error('Google Routes no devolvió geometría para la ruta.');
  return {
    provider: 'google',
    mode: normalizeSavedPlaceRouteMode(route.mode || mode),
    distance: Number(route.distance) || 0,
    duration: Number(route.duration) || 0,
    geometry: route.geometry,
    calculatedAt: String(route.calculatedAt || ''),
    transitSteps: Array.isArray(route.transitSteps) ? route.transitSteps : [],
  };
}
