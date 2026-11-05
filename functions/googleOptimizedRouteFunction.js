import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_ROUTES_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError, validPoint } from './geoapifySupport.js';

const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.travelMode',
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
    const previous = segments.at(-1);
    if (previous && previous.kind === kind && previous.color === color && previous.label === label && previous.icon === icon) {
      previous.geometry.coordinates.push(...geometry.coordinates.slice(1));
      return;
    }
    segments.push({ kind, color, textColor, label, icon, geometry });
  });
  return segments.slice(0, MAX_ROUTE_SEGMENTS);
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

    try {
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

      const fetchRoute = async (requestBody) => {
        const payload = await limitedFetch(
          GOOGLE_ROUTES_URL,
          {
            method: 'POST',
            headers: googleHeaders(),
            body: JSON.stringify(requestBody),
          },
          'Google Routes'
        );
        return payload.routes?.[0] || null;
      };
      let route = await fetchRoute(body);
      // Transporte público: si Google propone bus, se busca también en metro/tren.
      if (requestedMode === 'transit' && routeUsesBus(route)) {
        const railRoute = await fetchRoute({ ...body, transitPreferences: RAIL_ONLY_TRANSIT }).catch(() => null);
        route = preferRailRoute(route, railRoute);
      }
      if (!route) throw new Error('Google Routes no devolvió una ruta.');
      const geometry = decodeGooglePolyline(cleanText(route.polyline?.encodedPolyline, 1000000));
      if (!geometry) throw new Error('Google Routes no devolvió una geometría válida.');

      return {
        provider: 'google',
        mode: requestedMode,
        geometry,
        distance: Math.max(0, Number(route.distanceMeters) || 0),
        duration: parseDurationSeconds(route.duration),
        calculatedAt: new Date().toISOString(),
        transitSteps: transitSummary(route),
        segments: routeSegments(route),
      };
    } catch (error) {
      logError('Optimized Google route calculation failed.', {
        ...safeError(error),
        mode: requestedMode,
      });
      throw new HttpsError('internal', 'No fue posible calcular esta ruta con Google Routes.');
    }
  }
);
