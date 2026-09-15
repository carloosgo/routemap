import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import {
  GEOAPIFY_API_KEY,
  QUOTAS,
  db,
} from './geoapifyRuntime.js';
import { safeError } from './geoapifySupport.js';

const STATIC_MAP_URL = 'https://maps.geoapify.com/v1/staticmap';
const LOGICAL_WIDTH = 720;
const LOGICAL_HEIGHT = 620;
const SCALE_FACTOR = 2;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function validNumber(value, min, max, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : fallback;
}

function staticMapKey() {
  const key = GEOAPIFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Falta el secreto GEOAPIFY_API_KEY.');
  return key;
}

export function buildItineraryStaticMapUrl({ center, zoom, language = 'es' }, apiKey) {
  const lat = validNumber(center?.lat, -85, 85);
  const lon = validNumber(center?.lon, -180, 180);
  const safeZoom = validNumber(zoom, 1, 20);
  if (lat == null || lon == null || safeZoom == null) {
    throw new HttpsError('invalid-argument', 'El viewport del mapa es inválido.');
  }
  const params = new URLSearchParams({
    style: 'osm-bright',
    width: String(LOGICAL_WIDTH),
    height: String(LOGICAL_HEIGHT),
    scaleFactor: String(SCALE_FACTOR),
    center: `lonlat:${lon.toFixed(6)},${lat.toFixed(6)}`,
    zoom: safeZoom.toFixed(4),
    format: 'jpeg',
    lang: language === 'en' ? 'en' : 'es',
    apiKey,
  });
  return `${STATIC_MAP_URL}?${params.toString()}`;
}

export const geoapifyItineraryStaticMap = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    enforceAppCheck: false,
    timeoutSeconds: 20,
    memory: '256MiB',
    maxInstances: 4,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.itineraryStaticMap);
    try {
      const url = buildItineraryStaticMapUrl(request.data || {}, staticMapKey());
      const signal = globalThis.AbortSignal?.timeout?.(12_000);
      const response = await fetch(url, signal ? { signal } : undefined);
      if (!response.ok) throw new Error(`Geoapify Static Maps responded ${response.status}`);
      const contentType = String(response.headers.get('content-type') || '');
      if (!contentType.startsWith('image/')) throw new Error('Geoapify Static Maps returned a non-image response');
      const image = Buffer.from(await response.arrayBuffer());
      if (!image.length || image.length > MAX_IMAGE_BYTES) throw new Error('Geoapify Static Maps image size is invalid');
      return {
        imageBase64: image.toString('base64'),
        mimeType: contentType.includes('png') ? 'image/png' : 'image/jpeg',
        logicalWidth: LOGICAL_WIDTH,
        logicalHeight: LOGICAL_HEIGHT,
        pixelWidth: LOGICAL_WIDTH * SCALE_FACTOR,
        pixelHeight: LOGICAL_HEIGHT * SCALE_FACTOR,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logError('Itinerary static map failed.', safeError(error));
      throw new HttpsError('unavailable', 'No fue posible generar el mapa del itinerario.');
    }
  }
);