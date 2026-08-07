import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_MAPS_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError, validPoint } from './geoapifySupport.js';

const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.transitDetails.stopDetails',
  'routes.legs.steps.transitDetails.headsign',
  'routes.legs.steps.transitDetails.transitLine',
  'routes.legs.steps.transitDetails.stopCount',
  'routes.legs.steps.transitDetails.tripShortText',
].join(',');
const GOOGLE_ROUTE_MODES = new Set(['drive', 'transit', 'train', 'bus', 'bicycle', 'walk']);

function requireGoogleKey() {
  const key = GOOGLE_MAPS_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_MAPS_API_KEY.');
  }
  return key;
}

function cleanText(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validLanguage(value) {
  return value === 'en' ? 'en' : 'es';
}

function googleHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': requireGoogleKey(),
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
        lineName: cleanText(line.name, 120),
        lineShortName: cleanText(line.nameShort, 60),
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

export const googleRouteOptimized = onCall(
  callableOptions({
    secrets: [GOOGLE_MAPS_API_KEY],
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

      const payload = await limitedFetch(
        GOOGLE_ROUTES_URL,
        {
          method: 'POST',
          headers: googleHeaders(),
          body: JSON.stringify(body),
        },
        'Google Routes'
      );
      const route = payload.routes?.[0];
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
