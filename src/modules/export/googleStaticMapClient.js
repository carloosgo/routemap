import { config } from '../../config.js';
import { getItineraryMapRuntimeView } from '../map/itineraryMapRuntime.js';
import { itineraryMapViewport } from './itineraryStaticMapViewport.js';

const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';
const MAX_LOGICAL_SIZE = 640;
const MIN_LOGICAL_SIZE = 180;
const REQUEST_TIMEOUT_MS = 12_000;
const EXPORT_ZOOM_OFFSET = 1;
/* La caja del mapa en la portada A4 mide 539.89 x 466.28 pt. Pedir Static Maps
   con esa misma proporción evita letterboxing y usa la altura completa para mapa real. */
const PDF_MAP_ASPECT_RATIO = 539.89 / 466.28;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function staticSize() {
  const width = MAX_LOGICAL_SIZE;
  const height = clamp(
    Math.round(width / PDF_MAP_ASPECT_RATIO),
    MIN_LOGICAL_SIZE,
    MAX_LOGICAL_SIZE
  );
  return { width, height };
}

function integerZoom(value, offset = EXPORT_ZOOM_OFFSET) {
  return clamp(Math.round(Number(value) || 0) + Number(offset || 0), 0, 21);
}

export function buildGoogleStaticMapUrl(view, {
  language = 'es',
  apiKey = config.googleMaps.webApiKey,
  mapId = config.googleMaps.staticMapId,
  zoomOffset = EXPORT_ZOOM_OFFSET,
} = {}) {
  if (!view?.center) throw new Error('Google map viewport is unavailable');
  if (!apiKey) throw new Error('VITE_GOOGLE_MAPS_API_KEY is required for Maps Static API');
  if (!mapId) {
    throw new Error('VITE_GOOGLE_MAPS_STATIC_MAP_ID is required to preserve the Atlas map style');
  }

  const size = staticSize();
  const zoom = integerZoom(view.zoom, zoomOffset);
  const params = new URLSearchParams({
    center: `${Number(view.center.lat).toFixed(7)},${Number(view.center.lon).toFixed(7)}`,
    zoom: String(zoom),
    size: `${size.width}x${size.height}`,
    scale: '2',
    format: 'png32',
    maptype: String(view.mapType || 'roadmap'),
    language: language === 'en' ? 'en' : 'es',
    map_id: mapId,
    key: apiKey,
  });
  return {
    url: `${STATIC_MAP_ENDPOINT}?${params.toString()}`,
    size,
    zoom,
  };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.text()).trim().slice(0, 180); } catch { /* no-op */ }
      throw new Error(`Google Static Maps request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) {
      throw new Error(`Google Static Maps returned ${mimeType || 'an invalid response'}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error('Google Static Maps returned an empty image');
    return { bytes, mimeType };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Google Static Maps request timed out', { cause: error });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function staticMapResult(image, request, view) {
  return {
    ...image,
    pixelWidth: request.size.width * 2,
    pixelHeight: request.size.height * 2,
    viewport: {
      center: { ...view.center },
      zoom: request.zoom,
      width: request.size.width,
      height: request.size.height,
      tileSize: 256,
    },
  };
}

export async function loadCurrentGoogleStaticMap({ language = 'es' } = {}) {
  const view = getItineraryMapRuntimeView();
  if (!view) throw new Error('The current Google map viewport is unavailable');
  const request = buildGoogleStaticMapUrl(view, { language });
  const image = await fetchWithTimeout(request.url);
  return staticMapResult(image, request, view);
}

export async function loadItineraryGoogleStaticMap(model, { language = 'es' } = {}) {
  const size = staticSize();
  const entries = [
    ...(model?.hasOrigin && model?.origin ? [model.origin] : []),
    ...(Array.isArray(model?.stops) ? model.stops : []),
  ];
  const fittedView = itineraryMapViewport(entries, {
    width: size.width,
    height: size.height,
    padding: 54,
    tileSize: 256,
  });
  const view = {
    ...fittedView,
    zoom: Math.floor(fittedView.zoom),
    mapType: 'roadmap',
  };
  const request = buildGoogleStaticMapUrl(view, { language, zoomOffset: 0 });
  const image = await fetchWithTimeout(request.url);
  return staticMapResult(image, request, view);
}
