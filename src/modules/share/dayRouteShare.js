import { config } from '../../config.js';

/**
 * Compartir un día de Mis rutas: texto con los lugares en orden, enlace de
 * Google Maps con la ruta del día e imagen estática del mapa del día.
 * Todo se calcula en el navegador a partir del viaje; no se persiste nada.
 */

const MAPS_DIR_ENDPOINT = 'https://www.google.com/maps/dir/';
const MAPS_SEARCH_ENDPOINT = 'https://www.google.com/maps/search/';
const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';
// Google Maps URLs admite origen + 9 paradas intermedias + destino.
export const MAX_PLACES_PER_MAPS_LINK = 11;
const STATIC_MAP_MAX_URL = 15_000;
const STATIC_MAP_LINE_POINTS = 90;

const TRAVEL_MODES = Object.freeze({
  walk: 'walking',
  transit: 'transit',
  drive: 'driving',
  bicycle: 'bicycling',
});

const MODE_LABEL_KEYS = Object.freeze({
  walk: 'routeModeWalk',
  transit: 'routeModeTransit',
  drive: 'routeModeDrive',
  bicycle: 'routeModeBicycle',
});

const STATIC_PATH_COLORS = Object.freeze({
  walk: '0x475467',
  transit: '0x0e4f63',
  drive: '0x0e4f63',
  bicycle: '0x2a7d73',
  none: '0x0b1f2cb0',
});

function hasCoordinates(place) {
  return Number.isFinite(Number(place?.lat))
    && Number.isFinite(Number(place?.lng ?? place?.lon))
    && place?.lat !== null
    && (place?.lng ?? place?.lon) !== null;
}

function coordinateText(place) {
  const lng = place.lng ?? place.lon;
  return `${Number(place.lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}

function placeName(place) {
  return String(place?.name || place?.userLabel || '').trim();
}

/** Texto de búsqueda de un lugar para Google Maps: nombre y ciudad, o coordenadas. */
function placeQuery(place) {
  const name = placeName(place);
  if (name && place?.googlePlaceId) {
    return [name, place?.city].map((value) => String(value || '').trim()).filter(Boolean).join(', ');
  }
  return hasCoordinates(place) ? coordinateText(place) : name;
}

/**
 * Modo de viaje común del día. Solo se fija si todos los tramos elegidos usan
 * el mismo modo; Google no admite paradas intermedias en transporte público.
 */
export function commonTravelMode(places, routeFor) {
  const modes = new Set();
  for (let index = 0; index < places.length - 1; index += 1) {
    const route = routeFor?.(places[index], places[index + 1]);
    if (route?.mode) modes.add(route.mode);
  }
  if (modes.size !== 1) return '';
  const [mode] = modes;
  if (mode === 'transit' && places.length > 2) return '';
  return TRAVEL_MODES[mode] || '';
}

function singlePlaceUrl(place) {
  const params = new URLSearchParams({ api: '1', query: placeQuery(place) });
  if (place?.googlePlaceId) params.set('query_place_id', place.googlePlaceId);
  return `${MAPS_SEARCH_ENDPOINT}?${params.toString()}`;
}

function directionsUrl(places, travelMode) {
  const origin = places[0];
  const destination = places.at(-1);
  const waypoints = places.slice(1, -1);
  const params = new URLSearchParams({ api: '1', origin: placeQuery(origin), destination: placeQuery(destination) });
  if (origin.googlePlaceId) params.set('origin_place_id', origin.googlePlaceId);
  if (destination.googlePlaceId) params.set('destination_place_id', destination.googlePlaceId);
  if (waypoints.length) {
    params.set('waypoints', waypoints.map(placeQuery).join('|'));
    // Los ids solo sirven si todas las paradas los tienen (misma posición).
    if (waypoints.every((place) => place.googlePlaceId)) {
      params.set('waypoint_place_ids', waypoints.map((place) => place.googlePlaceId).join('|'));
    }
  }
  if (travelMode) params.set('travelmode', travelMode);
  return `${MAPS_DIR_ENDPOINT}?${params.toString()}`;
}

/**
 * Enlaces de Google Maps con la ruta del día. Si hay más paradas de las que
 * admite un enlace, se parte en tramos encadenados (el último lugar de un
 * tramo es el primero del siguiente).
 */
export function dayGoogleMapsLinks(places, routeFor) {
  const usable = (places || []).filter((place) => placeQuery(place));
  if (!usable.length) return [];
  if (usable.length === 1) return [singlePlaceUrl(usable[0])];
  const links = [];
  for (let start = 0; start < usable.length - 1; start += MAX_PLACES_PER_MAPS_LINK - 1) {
    const chunk = usable.slice(start, start + MAX_PLACES_PER_MAPS_LINK);
    links.push(directionsUrl(chunk, commonTravelMode(chunk, routeFor)));
  }
  return links;
}

function formatMinutes(seconds) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatKm(meters, intlLocale) {
  const value = Number(meters) || 0;
  if (value <= 0) return '';
  if (value < 1000) return `${Math.round(value / 10) * 10} m`;
  return `${new Intl.NumberFormat(intlLocale || 'es-MX', { maximumFractionDigits: value < 10000 ? 1 : 0 }).format(value / 1000)} km`;
}

function legLine(route, t, intlLocale) {
  if (!route?.mode) return '';
  return [
    t(MODE_LABEL_KEYS[route.mode] || 'routeMode'),
    formatMinutes(route.duration),
    formatKm(route.distance, intlLocale),
  ].filter(Boolean).join(' · ');
}

/**
 * Texto para compartir: título del día, lugares numerados (con el modo
 * elegido entre paradas) y el enlace de Google Maps.
 */
export function dayShareText({ title, subtitle, places, routeFor, links, t, intlLocale }) {
  const lines = [[title, subtitle].filter(Boolean).join(' · ')];
  if (places.length) lines.push('');
  places.forEach((place, index) => {
    const address = String(place?.address || '').trim();
    const name = placeName(place) || t('place');
    lines.push(`${index + 1}. ${name}${address && address !== name ? ` (${address})` : ''}`);
    const next = places[index + 1];
    const leg = next ? legLine(routeFor?.(place, next), t, intlLocale) : '';
    if (leg) lines.push(`   ↓ ${leg}`);
  });
  if (links.length) {
    lines.push('');
    lines.push(t(links.length > 1 ? 'shareDayMapsLinks' : 'shareDayMapsLink'));
    links.forEach((link) => lines.push(link));
  }
  return lines.join('\n');
}

/* ---------- Imagen del mapa (Maps Static API) ---------- */

function encodeSigned(value) {
  let number = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (number >= 0x20) {
    output += String.fromCharCode((0x20 | (number & 0x1f)) + 63);
    number >>= 5;
  }
  return output + String.fromCharCode(number + 63);
}

/** Polilínea codificada de Google para puntos `[lat, lng]`. */
export function encodePolyline(points) {
  let lastLat = 0;
  let lastLng = 0;
  let output = '';
  points.forEach(([lat, lng]) => {
    const nextLat = Math.round(lat * 1e5);
    const nextLng = Math.round(lng * 1e5);
    output += encodeSigned(nextLat - lastLat) + encodeSigned(nextLng - lastLng);
    lastLat = nextLat;
    lastLng = nextLng;
  });
  return output;
}

function geometryLines(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function downsample(points, limit) {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

function legPoints(origin, destination, route) {
  const line = geometryLines(route?.geometry)
    .flat()
    .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([lng, lat]) => [lat, lng]);
  if (line.length >= 2) return downsample(line, STATIC_MAP_LINE_POINTS);
  return [
    [Number(origin.lat), Number(origin.lng ?? origin.lon)],
    [Number(destination.lat), Number(destination.lng ?? destination.lon)],
  ];
}

function staticColor(hex) {
  const clean = String(hex || '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(clean) ? `0x${clean.toLowerCase()}` : '0x0e4f63';
}

/**
 * URL de Maps Static API con las paradas numeradas en el color de su país y
 * los tramos del día. Sin centro ni zoom: Google encuadra marcadores y trazos.
 */
export function dayStaticMapUrl(places, {
  routeFor,
  colorFor,
  language = 'es',
  apiKey = config.googleMaps.webApiKey,
  mapId = config.googleMaps.staticMapId,
  width = 640,
  height = 400,
} = {}) {
  if (!apiKey) return '';
  const stops = (places || []).filter(hasCoordinates);
  if (!stops.length) return '';

  const params = [
    ['size', `${width}x${height}`],
    ['scale', '2'],
    ['format', 'png'],
    ['maptype', 'roadmap'],
    ['language', language === 'en' ? 'en' : 'es'],
  ];
  if (mapId) params.push(['map_id', mapId]);
  if (stops.length === 1) params.push(['zoom', '15']);

  stops.forEach((place, index) => {
    const label = index < 9 ? String(index + 1) : '';
    const style = [`color:${staticColor(colorFor?.(place))}`, label ? `label:${label}` : 'size:mid'];
    params.push(['markers', `${style.join('|')}|${coordinateText(place)}`]);
  });

  const paths = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const route = routeFor?.(stops[index], stops[index + 1]) || null;
    const color = STATIC_PATH_COLORS[route?.mode] || STATIC_PATH_COLORS.none;
    const weight = route?.mode ? 5 : 3;
    paths.push(`color:${color}|weight:${weight}|enc:${encodePolyline(legPoints(stops[index], stops[index + 1], route))}`);
  }

  const build = (withPaths) => {
    const search = new URLSearchParams(params);
    withPaths.forEach((path) => search.append('path', path));
    search.set('key', apiKey);
    return `${STATIC_MAP_ENDPOINT}?${search.toString()}`;
  };

  let url = build(paths);
  // Si la URL excede el límite de Google, se usan rectas entre paradas.
  if (url.length > STATIC_MAP_MAX_URL) {
    url = build(paths.map((_, index) => {
      const route = routeFor?.(stops[index], stops[index + 1]) || null;
      const color = STATIC_PATH_COLORS[route?.mode] || STATIC_PATH_COLORS.none;
      return `color:${color}|weight:4|enc:${encodePolyline(legPoints(stops[index], stops[index + 1], null))}`;
    }));
  }
  return url;
}

/** Descarga la imagen del mapa como `File` listo para compartir. */
export async function loadDayStaticMapFile(url, fileName, { timeoutMs = 12_000 } = {}) {
  if (!url) throw new Error('Static map unavailable');
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Static map request failed (${response.status})`);
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim();
    if (!type.startsWith('image/')) throw new Error('Static map returned no image');
    const blob = await response.blob();
    return new globalThis.File([blob], fileName, { type: type || 'image/png' });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** Nombre de archivo seguro, p. ej. `atlas-dia-3-kioto.png`. */
export function dayShareFileName(dayNumber, cityName, prefix = 'atlas-dia') {
  const slug = String(cityName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return [prefix, dayNumber, slug].filter(Boolean).join('-') + '.png';
}
