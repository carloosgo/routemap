/**
 * Compartir un día de Mis rutas con un link corto: se guarda una copia
 * pública y mínima del día (lugares en orden, modo y trazo de cada tramo y
 * enlaces de Google Maps) y la vista /share/dia/<id> la muestra sin sesión.
 */

const MAPS_DIR_ENDPOINT = 'https://www.google.com/maps/dir/';
const MAPS_SEARCH_ENDPOINT = 'https://www.google.com/maps/search/';
// Google Maps URLs admite origen + 9 paradas intermedias + destino.
export const MAX_PLACES_PER_MAPS_LINK = 11;
const SHARE_LINE_POINTS = 160;
export const MAX_SHARED_PLACES = 60;

const TRAVEL_MODES = Object.freeze({
  walk: 'walking',
  transit: 'transit',
  drive: 'driving',
  bicycle: 'bicycling',
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

export function placeMapsUrl(place) {
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
  if (usable.length === 1) return [placeMapsUrl(usable[0])];
  const links = [];
  for (let start = 0; start < usable.length - 1; start += MAX_PLACES_PER_MAPS_LINK - 1) {
    const chunk = usable.slice(start, start + MAX_PLACES_PER_MAPS_LINK);
    links.push(directionsUrl(chunk, commonTravelMode(chunk, routeFor)));
  }
  return links;
}

/* ---------- Polilíneas (formato de Google) ---------- */

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
  if (line.length >= 2) return downsample(line, SHARE_LINE_POINTS);
  return [
    [Number(origin.lat), Number(origin.lng ?? origin.lon)],
    [Number(destination.lat), Number(destination.lng ?? destination.lon)],
  ];
}


/** Decodifica una polilínea de Google a puntos `[lat, lng]`. */
export function decodePolyline(value) {
  const text = String(value || '');
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      if (index >= text.length) return null;
      byte = text.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < text.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function cleanColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#0e4f63';
}

/**
 * Copia pública del día: solo lo necesario para verlo. No incluye notas,
 * gastos, ids internos ni el resto del viaje.
 */
export function buildPublicDayShareModel({ title, subtitle, places, routeFor, colorFor }) {
  const stops = (places || []).filter(hasCoordinates).slice(0, MAX_SHARED_PLACES);
  const legs = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const route = routeFor?.(stops[index], stops[index + 1]) || null;
    const mode = TRAVEL_MODES[route?.mode] ? route.mode : '';
    legs.push({
      mode,
      distance: mode ? cleanNumber(route.distance) : 0,
      duration: mode ? cleanNumber(route.duration) : 0,
      path: mode ? encodePolyline(legPoints(stops[index], stops[index + 1], route)) : '',
    });
  }
  return {
    title: cleanText(title, 160),
    subtitle: cleanText(subtitle, 200),
    places: stops.map((place, index) => ({
      number: index + 1,
      name: cleanText(placeName(place), 160),
      address: cleanText(place.address, 260),
      category: cleanText(place.category, 80),
      lat: Number(place.lat),
      lon: Number(place.lng ?? place.lon),
      color: cleanColor(colorFor?.(place)),
      googlePlaceId: cleanText(place.googlePlaceId, 300),
    })),
    legs,
    mapsLinks: dayGoogleMapsLinks(stops, routeFor).slice(0, 8),
  };
}

/**
 * Comprueba en el cliente las mismas condiciones que `validSharedDayModel`
 * en firestore.rules y devuelve la lista de las que no se cumplen.
 */
export function dayShareModelIssues(model) {
  const issues = [];
  const keys = Object.keys(model || {}).sort().join(',');
  if (keys !== 'legs,mapsLinks,places,subtitle,title') issues.push(`keys:${keys}`);
  if (typeof model?.title !== 'string' || model.title.length > 160) issues.push('title');
  if (typeof model?.subtitle !== 'string' || model.subtitle.length > 200) issues.push('subtitle');
  if (!Array.isArray(model?.places) || model.places.length < 1 || model.places.length > 60) {
    issues.push(`places:${Array.isArray(model?.places) ? model.places.length : typeof model?.places}`);
  }
  if (!Array.isArray(model?.legs) || model.legs.length > 59) issues.push(`legs:${model?.legs?.length}`);
  if (!Array.isArray(model?.mapsLinks) || model.mapsLinks.length > 8) issues.push(`links:${model?.mapsLinks?.length}`);
  return issues;
}
