import { config } from '../../config.js';
import { getItineraryMapRuntimeView } from '../map/itineraryMapRuntime.js';

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

function integerZoom(value) {
  return clamp(Math.round(Number(value) || 0) + EXPORT_ZOOM_OFFSET, 0, 21);
}

export function buildGoogleStaticMapUrl(view, {
  language = 'es',
  apiKey = config.googleMaps.webApiKey,
  mapId = config.googleMaps.staticMapId,
} = {}) {
  if (!view?.center) throw new Error('Google map viewport is unavailable');
  if (!apiKey) throw new Error('VITE_GOOGLE_MAPS_API_KEY is required for Maps Static API');
  if (!mapId) {
    throw new Error('VITE_GOOGLE_MAPS_STATIC_MAP_ID is required to preserve the Atlas map style');
  }

  const size = staticSize();
  const params = new URLSearchParams({
    center: `${Number(view.center.lat).toFixed(7)},${Number(view.center.lon).toFixed(7)}`,
    zoom: String(integerZoom(view.zoom)),
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
    zoom: integerZoom(view.zoom),
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

export async function loadCurrentGoogleStaticMap({ language = 'es' } = {}) {
  const view = getItineraryMapRuntimeView();
  if (!view) throw new Error('The current Google map viewport is unavailable');
  const request = buildGoogleStaticMapUrl(view, { language });
  const image = await fetchWithTimeout(request.url);
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
