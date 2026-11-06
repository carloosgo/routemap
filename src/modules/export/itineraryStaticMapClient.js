import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import {
  ITINERARY_STATIC_MAP_SIZE,
  itineraryMapViewport,
} from './itineraryStaticMapViewport.js';

function decodeBase64(value) {
  const raw = globalThis.atob(String(value || ''));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function routeEntries(model) {
  return [
    ...(model?.hasOrigin ? [model.origin] : []),
    ...(Array.isArray(model?.stops) ? model.stops : []),
  ];
}

export async function loadItineraryStaticMap(model, { language = 'es' } = {}) {
  const viewport = itineraryMapViewport(routeEntries(model), ITINERARY_STATIC_MAP_SIZE);
  const request = firebaseCallable('geoapifyItineraryStaticMap');
  const response = await request({
    center: viewport.center,
    zoom: viewport.zoom,
    language: language === 'en' ? 'en' : 'es',
  });
  const payload = response.data || {};
  const bytes = decodeBase64(payload.imageBase64);
  if (!bytes.length) throw new Error('Static itinerary map image is empty');
  return {
    bytes,
    mimeType: payload.mimeType || 'image/jpeg',
    pixelWidth: Number(payload.pixelWidth) || (viewport.width * 2),
    pixelHeight: Number(payload.pixelHeight) || (viewport.height * 2),
    viewport: {
      ...viewport,
      width: Number(payload.logicalWidth) || viewport.width,
      height: Number(payload.logicalHeight) || viewport.height,
    },
  };
}