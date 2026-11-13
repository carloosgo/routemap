import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_ROUTES_API_KEY, QUOTAS, cacheDb, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError, validPoint } from './geoapifySupport.js';
import { createSharedCache } from './sharedCache.js';

const TRANSIT_CACHE_VERSION = 'v2';
const cachedTransitRoute = createSharedCache(cacheDb, { ttlMs: 24 * 60 * 60 * 1000 });

const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.transitDetails.stopDetails',
  'routes.legs.steps.transitDetails.headsign',
  'routes.legs.steps.transitDetails.transitLine',
  'routes.legs.steps.transitDetails.stopCount',
  'routes.legs.steps.transitDetails.tripShortText',
  'routes.legs.steps.transitDetails.localizedValues',
].join(',');
const GOOGLE_ROUTE_MODES = new Set(['drive', 'transit', 'train', 'bus', 'bicycle', 'walk']);

function requireGoogleRoutesKey() {
  const key = GOOGLE_ROUTES_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_ROUTES_API_KEY.');
  }
  return key;
}

function cleanText(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TRANSIT_ICON_HOSTS = ['gstatic.com', 'google.com', 'googleapis.com', 'googleusercontent.com'];

/** Logo de línea u operador que da Google; solo https y dominios de Google. */
export function transitIconUri(value) {
  const raw = cleanText(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    const host = url.hostname.toLowerCase();
    const trusted = TRANSIT_ICON_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
    return url.protocol === 'https:' && trusted ? url.href : '';
  } catch {
    return '';
  }
}

function transitLineLogo(line) {
  return transitIconUri(line?.iconUri) || transitIconUri(line?.vehicle?.localIconUri);
}

function validLanguage(value) {
  return value === 'en' ? 'en' : 'es';
}

function googleHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': requireGoogleRoutesKey(),
    'X-Goog-FieldMask': ROUTE_FIELDS,
  };
}

function parseDurationSeconds(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(value || ''));
  return match ? Number(match[1]) : 0;
}

function decodeGooglePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lng / 1e5, lat / 1e5]);
  }
  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
}

function routeRequestMode(mode) {
  if (mode === 'drive') return { travelMode: 'DRIVE' };
  if (mode === 'bicycle') return { travelMode: 'BICYCLE' };
  if (mode === 'walk') return { travelMode: 'WALK' };
  if (mode === 'train') {
    return {
      travelMode: 'TRANSIT',
      transitPreferences: { allowedTravelModes: ['TRAIN', 'RAIL', 'SUBWAY', 'LIGHT_RAIL'] },
    };
  }
  if (mode === 'bus') {
    return {
      travelMode: 'TRANSIT',
      transitPreferences: { allowedTravelModes: ['BUS'] },
    };
  }
  return { travelMode: 'TRANSIT' };
}

const BUS_VEHICLES = new Set(['BUS', 'INTERCITY_BUS', 'TROLLEYBUS', 'SHARE_TAXI']);
const RAIL_ONLY_TRANSIT = Object.freeze({ allowedTravelModes: ['SUBWAY', 'TRAIN', 'LIGHT_RAIL', 'RAIL'] });
// Una alternativa en metro o tren se prefiere si no tarda mucho más que la de bus.
const RAIL_MAX_RATIO = 1.35;
const RAIL_MAX_EXTRA_SECONDS = 20 * 60;

export function routeUsesBus(route) {
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];
  return steps.some((step) =>
    step?.travelMode === 'TRANSIT'
    && BUS_VEHICLES.has(String(step?.transitDetails?.transitLine?.vehicle?.type || ''))
  );
}

// Caminatas: Google optimiza solo el tiempo y a veces termina con una
// caminata larga aunque haya otra línea o estación más cerca del destino.
// Cada minuto caminado por encima de WALK_FREE_SECONDS cuenta doble al
// comparar alternativas, siempre que la alternativa no tarde mucho más.
const WALK_FREE_SECONDS = 4 * 60;
const WALK_PENALTY = 1;
const WALK_SPEED_MPS = 1.3;

export function routeWalkSeconds(route) {
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];
  return steps
    .filter((step) => step?.travelMode === 'WALK')
    .reduce((total, step) => total + stepWalkSeconds(step), 0);
}

// Regla general (cualquier ciudad), al comparar alternativas parecidas:
// 1. Riel primero: metro, tranvía y tren. Un transbordo entre dos líneas de
//    riel cuesta poco, así que se prefiere «tranvía + metro» que te deja cerca
//    sobre «tranvía + caminar mucho».
// 2. Caminar largo (al final o entre estaciones distintas) cuesta el doble.
// 3. El bus es la última opción: cada minuto en bus cuenta 1.5. Si en la
//    ciudad no hay riel, todas las opciones llevan bus y gana la de siempre.
const RAIL_TRANSFER_SECONDS = 60;
const MIXED_TRANSFER_SECONDS = 3 * 60;
const TRANSFER_WALK_FREE_SECONDS = 2 * 60;
const TRANSFER_WALK_PENALTY = 1;
const BUS_RIDE_PENALTY = 0.5;
const BUS_FIXED_PENALTY_SECONDS = 3 * 60;

function stepWalkSeconds(step) {
  const seconds = parseDurationSeconds(step?.staticDuration);
  return seconds || Math.max(0, Number(step?.distanceMeters) || 0) / WALK_SPEED_MPS;
}

function stepIsBus(step) {
  return BUS_VEHICLES.has(String(step?.transitDetails?.transitLine?.vehicle?.type || ''));
}

export function routeTransferStats(route) {
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];
  const transitIndexes = steps
    .map((step, index) => (step?.travelMode === 'TRANSIT' ? index : -1))
    .filter((index) => index >= 0);
  let walkSeconds = 0;
  let railTransfers = 0;
  let mixedTransfers = 0;
  for (let k = 1; k < transitIndexes.length; k += 1) {
    let between = 0;
    for (let i = transitIndexes[k - 1] + 1; i < transitIndexes[k]; i += 1) {
      if (steps[i]?.travelMode === 'WALK') between += stepWalkSeconds(steps[i]);
    }
    walkSeconds += Math.max(0, between - TRANSFER_WALK_FREE_SECONDS);
    if (stepIsBus(steps[transitIndexes[k - 1]]) || stepIsBus(steps[transitIndexes[k]])) mixedTransfers += 1;
    else railTransfers += 1;
  }
  const busSeconds = transitIndexes
    .map((index) => steps[index])
    .filter(stepIsBus)
    .reduce((total, step) => total + (parseDurationSeconds(step?.staticDuration) || 0), 0);
  return {
    transfers: Math.max(0, transitIndexes.length - 1),
    railTransfers,
    mixedTransfers,
    walkSeconds,
    busSeconds,
    usesBus: transitIndexes.some((index) => stepIsBus(steps[index])),
  };
}

// Red principal de la ciudad: entre las candidatas, el tipo de riel (metro,
// tranvía o tren) con más minutos de viaje. Usar otro tipo de riel cuesta un
// poco más y cambiar de tipo en un transbordo también: «metro + metro» le
// gana a «tren + caminar + metro» cuando tardan parecido.
const VEHICLE_FAMILIES = Object.freeze({
  SUBWAY: 'metro',
  METRO_RAIL: 'metro',
  MONORAIL: 'metro',
  TRAM: 'tram',
  LIGHT_RAIL: 'tram',
  RAIL: 'train',
  HEAVY_RAIL: 'train',
  COMMUTER_TRAIN: 'train',
  HIGH_SPEED_TRAIN: 'train',
  LONG_DISTANCE_TRAIN: 'train',
});
const OFF_NETWORK_PENALTY = 0.25;
const FAMILY_SWITCH_SECONDS = 60;

function stepFamily(step) {
  if (stepIsBus(step)) return 'bus';
  return VEHICLE_FAMILIES[String(step?.transitDetails?.transitLine?.vehicle?.type || '')] || 'other';
}

function transitSteps(route) {
  return (route?.legs?.flatMap((leg) => leg?.steps || []) || []).filter((step) => step?.travelMode === 'TRANSIT');
}

export function primaryRailFamily(routes) {
  const totals = new Map();
  (Array.isArray(routes) ? routes : []).forEach((route) => {
    transitSteps(route).forEach((step) => {
      const family = stepFamily(step);
      if (family === 'bus' || family === 'other') return;
      totals.set(family, (totals.get(family) || 0) + (parseDurationSeconds(step?.staticDuration) || 1));
    });
  });
  let best = '';
  totals.forEach((seconds, family) => {
    if (!best || seconds > totals.get(best)) best = family;
  });
  return best;
}

export function transitEffort(route, primary = '') {
  const duration = parseDurationSeconds(route?.duration);
  const stats = routeTransferStats(route);
  const steps = transitSteps(route);
  const families = steps.map(stepFamily);
  let networkPenalty = 0;
  if (primary) {
    steps.forEach((step, index) => {
      const family = families[index];
      if (family !== primary && family !== 'bus' && family !== 'other') {
        networkPenalty += OFF_NETWORK_PENALTY * (parseDurationSeconds(step?.staticDuration) || 0);
      }
    });
  }
  for (let index = 1; index < families.length; index += 1) {
    if (families[index] !== families[index - 1]) networkPenalty += FAMILY_SWITCH_SECONDS;
  }
  return duration
    + WALK_PENALTY * Math.max(0, routeWalkSeconds(route) - WALK_FREE_SECONDS)
    + RAIL_TRANSFER_SECONDS * stats.railTransfers
    + MIXED_TRANSFER_SECONDS * stats.mixedTransfers
    + TRANSFER_WALK_PENALTY * stats.walkSeconds
    + (stats.usesBus ? BUS_FIXED_PENALTY_SECONDS + BUS_RIDE_PENALTY * stats.busSeconds : 0)
    + networkPenalty;
}

/** Resumen corto de una candidata para depurar la elección («RER A › 8»). */
export function routeLinesText(route) {
  return transitSteps(route)
    .map((step) => {
      const line = step?.transitDetails?.transitLine || {};
      return String(line.nameShort || line.name || line.vehicle?.type || '?').slice(0, 24);
    })
    .join(' › ');
}

/**
 * Entre la ruta de Google y sus alternativas (incluida la de «menos caminata»)
 * elige la que menos obliga a caminar sin tardar mucho más que la original.
 */
export function chooseTransitRoute(defaultRoute, alternatives = [], { explain } = {}) {
  if (!defaultRoute) return alternatives.find(Boolean) || null;
  const base = parseDurationSeconds(defaultRoute.duration);
  if (!base) return defaultRoute;
  const primary = primaryRailFamily([defaultRoute, ...alternatives]);
  let best = defaultRoute;
  let bestEffort = transitEffort(defaultRoute, primary);
  const notes = [{ route: defaultRoute, effort: bestEffort, allowed: true }];
  alternatives.forEach((route) => {
    const duration = parseDurationSeconds(route?.duration);
    const allowed = Boolean(duration) && duration <= base * RAIL_MAX_RATIO && duration - base <= RAIL_MAX_EXTRA_SECONDS;
    const effort = allowed ? transitEffort(route, primary) : Infinity;
    notes.push({ route, effort, allowed });
    if (allowed && effort < bestEffort) {
      best = route;
      bestEffort = effort;
    }
  });
  if (typeof explain === 'function') {
    const seen = new Set();
    explain({
      primary,
      candidates: notes
        .map(({ route, effort, allowed }) => ({
          lines: routeLinesText(route),
          minutes: Math.round(parseDurationSeconds(route?.duration) / 60),
          effort: Number.isFinite(effort) ? Math.round(effort / 60) : null,
          allowed,
          chosen: route === best,
        }))
        .filter((note) => {
          const key = `${note.lines}|${note.minutes}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 12),
    });
  }
  return best;
}

/** Entre la ruta por defecto (con bus) y la de solo metro/tren, elige la de riel si es razonable. */
export function preferRailRoute(defaultRoute, railRoute) {
  if (!railRoute) return defaultRoute;
  if (!defaultRoute) return railRoute;
  const base = parseDurationSeconds(defaultRoute.duration);
  const rail = parseDurationSeconds(railRoute.duration);
  if (!base || !rail) return defaultRoute;
  return rail <= base * RAIL_MAX_RATIO && rail - base <= RAIL_MAX_EXTRA_SECONDS ? railRoute : defaultRoute;
}

function routeWaypoint(value) {
  const placeId = cleanText(value?.placeId, 256);
  if (placeId) return { placeId };
  if (!validPoint(value)) return null;
  return {
    location: {
      latLng: {
        latitude: Number(value.lat),
        longitude: Number(value.lon),
      },
    },
  };
}

function transitSummary(route) {
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];
  return steps
    .filter((step) => step?.travelMode === 'TRANSIT' && step?.transitDetails)
    .map((step) => {
      const details = step.transitDetails;
      const line = details.transitLine || {};
      const stops = details.stopDetails || {};
      return {
        departureStop: cleanText(stops.departureStop?.name, 160),
        arrivalStop: cleanText(stops.arrivalStop?.name, 160),
        departureTime: cleanText(stops.departureTime, 48),
        arrivalTime: cleanText(stops.arrivalTime, 48),
        // Hora local de cada estación: el viajero la lee en la hora de la ciudad.
        departureTimeZone: cleanText(details.localizedValues?.departureTime?.timeZone, 64),
        arrivalTimeZone: cleanText(details.localizedValues?.arrivalTime?.timeZone, 64),
        lineName: cleanText(line.name, 120),
        lineShortName: cleanText(line.nameShort, 60),
        lineColor: HEX_COLOR.test(String(line.color || '')) ? line.color : '',
        lineTextColor: HEX_COLOR.test(String(line.textColor || '')) ? line.textColor : '',
        lineIcon: transitLineLogo(line),
        vehicleType: cleanText(line.vehicle?.type, 60),
        agencies: (Array.isArray(line.agencies) ? line.agencies : [])
          .map((agency) => cleanText(agency?.name, 120))
          .filter(Boolean)
          .slice(0, 4),
        headsign: cleanText(details.headsign, 120),
        stopCount: Math.max(0, Number(details.stopCount) || 0),
        tripShortText: cleanText(details.tripShortText, 80),
      };
    })
    .slice(0, 24);
}

const MAX_ROUTE_SEGMENTS = 40;

// Estación de subida o bajada de Google (las intermedias las busca el cliente).
function stopPoint(name, latLng) {
  const lat = Number(latLng?.latitude);
  const lng = Number(latLng?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { name: cleanText(name, 80), lat, lng };
}

function stepKind(step) {
  if (step?.travelMode === 'TRANSIT') return 'transit';
  if (step?.travelMode === 'WALK') return 'walk';
  return 'other';
}

/**
 * Tramos de la ruta para pintarla por línea: cada tramo de transporte público
 * lleva el color oficial de su línea y las caminatas se agrupan.
 */
export function routeSegments(route) {
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];
  if (!steps.some((step) => step?.travelMode === 'TRANSIT')) return [];
  const segments = [];
  steps.forEach((step) => {
    const geometry = decodeGooglePolyline(cleanText(step?.polyline?.encodedPolyline, 200000));
    if (!geometry) return;
    const kind = stepKind(step);
    const line = step?.transitDetails?.transitLine || {};
    const color = kind === 'transit' && HEX_COLOR.test(String(line.color || '')) ? line.color : '';
    const label = kind === 'transit' ? cleanText(line.nameShort || line.name, 60) : '';
    const textColor = kind === 'transit' && HEX_COLOR.test(String(line.textColor || '')) ? line.textColor : '';
    const icon = kind === 'transit' ? transitLineLogo(line) : '';
    const details = kind === 'transit' ? step?.transitDetails || {} : {};
    const departure = stopPoint(details.stopDetails?.departureStop?.name, details.stopDetails?.departureStop?.location?.latLng);
    const arrival = stopPoint(details.stopDetails?.arrivalStop?.name, details.stopDetails?.arrivalStop?.location?.latLng);
    const stopCount = Math.max(0, Number(details.stopCount) || 0);
    const previous = segments.at(-1);
    if (previous && previous.kind === kind && previous.color === color && previous.label === label && previous.icon === icon) {
      previous.geometry.coordinates.push(...geometry.coordinates.slice(1));
      if (kind === 'transit') {
        previous.arrival = arrival || previous.arrival;
        previous.stopCount += stopCount;
      }
      return;
    }
    segments.push(kind === 'transit'
      ? { kind, color, textColor, label, icon, geometry, departure, arrival, stopCount, vehicle: cleanText(line.vehicle?.type, 40) }
      : { kind, color, textColor, label, icon, geometry });
  });
  return segments.slice(0, MAX_ROUTE_SEGMENTS).map((segment) => {
    if (segment.kind !== 'transit') return segment;
    const { departure, arrival, ...rest } = segment;
    return { ...rest, stops: [departure, arrival].filter(Boolean) };
  });
}

export const googleRouteOptimized = onCall(
  callableOptions({
    secrets: [GOOGLE_ROUTES_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googleRoute);
    const requestedMode = GOOGLE_ROUTE_MODES.has(request.data?.mode)
      ? request.data.mode
      : 'drive';
    const origin = routeWaypoint(request.data?.origin);
    const destination = routeWaypoint(request.data?.destination);
    if (!origin || !destination) {
      throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
    }

    const compute = async () => {
      const modeConfig = routeRequestMode(requestedMode);
      const body = {
        origin,
        destination,
        languageCode: validLanguage(request.data?.language),
        units: 'METRIC',
        polylineQuality: 'OVERVIEW',
        ...modeConfig,
      };
      const departureTime = cleanText(request.data?.departureTime, 48);
      if (modeConfig.travelMode === 'TRANSIT' && departureTime) {
        body.departureTime = departureTime;
      }

      const fetchRoutes = async (requestBody) => {
        const payload = await limitedFetch(
          GOOGLE_ROUTES_URL,
          {
            method: 'POST',
            headers: googleHeaders(),
            body: JSON.stringify(requestBody),
          },
          'Google Routes'
        );
        return Array.isArray(payload.routes) ? payload.routes.filter(Boolean) : [];
      };
      const fetchRoute = async (requestBody) => (await fetchRoutes(requestBody))[0] || null;
      let route;
      let choice = null;
      if (modeConfig.travelMode === 'TRANSIT') {
        // Candidatas: la de Google y sus alternativas, «menos caminata»,
        // «menos transbordos» y, en transporte general, las mismas solo en
        // riel (metro, tranvía, tren). Gana la de menor esfuerzo (ver arriba).
        const transitBody = { ...body, computeAlternativeRoutes: true };
        const variant = (prefs) => fetchRoutes({
          ...transitBody,
          transitPreferences: { ...(body.transitPreferences || {}), ...prefs },
        }).catch(() => []);
        const general = requestedMode === 'transit';
        const [routes, ...variants] = await Promise.all([
          fetchRoutes(transitBody),
          variant({ routingPreference: 'LESS_WALKING' }),
          variant({ routingPreference: 'FEWER_TRANSFERS' }),
          general ? variant(RAIL_ONLY_TRANSIT) : Promise.resolve([]),
          general ? variant({ ...RAIL_ONLY_TRANSIT, routingPreference: 'LESS_WALKING' }) : Promise.resolve([]),
        ]);
        route = chooseTransitRoute(routes[0] || null, [...routes.slice(1), ...variants.flat()], {
          explain: (info) => { choice = info; },
        });
      } else {
        route = await fetchRoute(body);
      }
      if (!route) throw new Error('Google Routes no devolvió una ruta.');
      const geometry = decodeGooglePolyline(cleanText(route.polyline?.encodedPolyline, 1000000));
      if (!geometry) throw new Error('Google Routes no devolvió una geometría válida.');

      const segments = routeSegments(route);
      return {
        provider: 'google',
        mode: requestedMode,
        geometry,
        distance: Math.max(0, Number(route.distanceMeters) || 0),
        duration: parseDurationSeconds(route.duration),
        calculatedAt: new Date().toISOString(),
        transitSteps: transitSummary(route),
        segments,
        ...(choice ? { choice } : {}),
      };
    };

    try {
      // Transporte público: la misma ruta (origen, destino, modo y salida) se
      // reutiliza 24 h para no repetir las 5 consultas a Google en cada sesión.
      if (requestedMode === 'transit' || requestedMode === 'train' || requestedMode === 'bus') {
        const key = [TRANSIT_CACHE_VERSION, requestedMode, JSON.stringify(origin), JSON.stringify(destination),
          cleanText(request.data?.departureTime, 48)].join('|');
        const { result } = await cachedTransitRoute('googleTransitRoutes', key, compute);
        return result;
      }
      return await compute();
    } catch (error) {
      logError('Optimized Google route calculation failed.', {
        ...safeError(error),
        mode: requestedMode,
      });
      throw new HttpsError('internal', 'No fue posible calcular esta ruta con Google Routes.');
    }
  }
);
