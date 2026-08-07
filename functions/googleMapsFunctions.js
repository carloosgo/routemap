import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import {
  GOOGLE_MAPS_API_KEY,
  QUOTAS,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  safeError,
  validPoint,
} from './geoapifySupport.js';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const AUTOCOMPLETE_FIELDS = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat.mainText.text',
  'suggestions.placePrediction.structuredFormat.secondaryText.text',
].join(',');
const DETAILS_FIELDS = [
  'id',
  'formattedAddress',
  'location',
  'addressComponents',
].join(',');
const REFRESH_DETAILS_FIELDS = `${DETAILS_FIELDS},displayName`;
const TEXT_SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
  'places.primaryType',
].join(',');
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

function validSessionToken(value) {
  const token = cleanText(value, 96);
  return /^[A-Za-z0-9_-]{16,96}$/.test(token) ? token : '';
}

function addressPart(components, type, fallbackTypes = []) {
  const wanted = new Set([type, ...fallbackTypes]);
  const component = (Array.isArray(components) ? components : []).find((item) =>
    Array.isArray(item?.types) && item.types.some((candidate) => wanted.has(candidate))
  );
  return cleanText(component?.longText || component?.shortText, 120);
}

function countryCode(components) {
  const component = (Array.isArray(components) ? components : []).find((item) =>
    Array.isArray(item?.types) && item.types.includes('country')
  );
  return cleanText(component?.shortText, 2).toUpperCase();
}

function mapGooglePlace(place, fallbackName = '') {
  const latitude = Number(place?.location?.latitude);
  const longitude = Number(place?.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const components = place?.addressComponents || [];
  return {
    id: cleanText(place?.id, 256),
    provider: 'google',
    googlePlaceId: cleanText(place?.id, 256),
    name: cleanText(place?.displayName?.text || fallbackName || 'Lugar', 160),
    address: cleanText(place?.formattedAddress, 260),
    city: addressPart(components, 'locality', ['postal_town', 'administrative_area_level_2']),
    country: addressPart(components, 'country'),
    countryCode: countryCode(components),
    category: cleanText(place?.primaryType, 80),
    lat: latitude,
    lon: longitude,
  };
}

function googleHeaders(fieldMask) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': requireGoogleKey(),
    'X-Goog-FieldMask': fieldMask,
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

export const googlePlaceAutocomplete = onCall(
  callableOptions({
    secrets: [GOOGLE_MAPS_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googlePlaceAutocomplete);
    const input = cleanText(request.data?.input, 120);
    const sessionToken = validSessionToken(request.data?.sessionToken);
    if (input.length < 4) return { suggestions: [] };
    if (!sessionToken) {
      throw new HttpsError('invalid-argument', 'La sesión de búsqueda es inválida.');
    }

    try {
      const payload = await limitedFetch(
        `${GOOGLE_PLACES_BASE}/places:autocomplete`,
        {
          method: 'POST',
          headers: googleHeaders(AUTOCOMPLETE_FIELDS),
          body: JSON.stringify({
            input,
            sessionToken,
            languageCode: validLanguage(request.data?.language),
          }),
        },
        'Google Places'
      );
      const suggestions = (payload.suggestions || [])
        .map((item) => item?.placePrediction)
        .filter(Boolean)
        .map((prediction) => ({
          id: cleanText(prediction.placeId, 256),
          name: cleanText(prediction.structuredFormat?.mainText?.text || prediction.text?.text, 160),
          displayName: cleanText(prediction.text?.text, 220),
          secondaryText: cleanText(prediction.structuredFormat?.secondaryText?.text, 180),
        }))
        .filter((item) => item.id && item.name)
        .slice(0, 5);
      return { suggestions };
    } catch (error) {
      logError('Google place autocomplete failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible buscar sugerencias de Google Places.');
    }
  }
);

export const googlePlaceDetails = onCall(
  callableOptions({
    secrets: [GOOGLE_MAPS_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googlePlaceDetails);
    const placeId = cleanText(request.data?.placeId, 256);
    const sessionToken = validSessionToken(request.data?.sessionToken);
    const fallbackName = cleanText(request.data?.name, 160);
    const includeDisplayName = request.data?.includeDisplayName === true;
    if (!placeId) {
      throw new HttpsError('invalid-argument', 'El lugar es inválido.');
    }

    try {
      const params = new URLSearchParams({
        languageCode: validLanguage(request.data?.language),
      });
      if (sessionToken) params.set('sessionToken', sessionToken);
      const payload = await limitedFetch(
        `${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}?${params}`,
        { headers: googleHeaders(includeDisplayName ? REFRESH_DETAILS_FIELDS : DETAILS_FIELDS) },
        'Google Places'
      );
      const place = mapGooglePlace(payload, fallbackName);
      if (!place) throw new Error('Google Places no devolvió coordenadas válidas.');
      return { place };
    } catch (error) {
      logError('Google place details failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible obtener el lugar de Google Places.');
    }
  }
);

export const googlePlaceSearch = onCall(
  callableOptions({
    secrets: [GOOGLE_MAPS_API_KEY],
    enforceAppCheck: false,
    maxInstances: 4,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googlePlaceSearch);
    const query = cleanText(request.data?.query, 120);
    if (query.length < 4) return { results: [] };

    try {
      const payload = await limitedFetch(
        `${GOOGLE_PLACES_BASE}/places:searchText`,
        {
          method: 'POST',
          headers: googleHeaders(TEXT_SEARCH_FIELDS),
          body: JSON.stringify({
            textQuery: query,
            languageCode: validLanguage(request.data?.language),
            maxResultCount: 5,
          }),
        },
        'Google Places'
      );
      return {
        results: (payload.places || [])
          .map((place) => mapGooglePlace(place))
          .filter(Boolean)
          .slice(0, 5),
      };
    } catch (error) {
      logError('Google text search failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible buscar lugares en Google Places.');
    }
  }
);

export const googleRoute = onCall(
  callableOptions({
    secrets: [GOOGLE_MAPS_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googleRoute);
    const { origin, destination } = request.data || {};
    const requestedMode = GOOGLE_ROUTE_MODES.has(request.data?.mode)
      ? request.data.mode
      : 'drive';
    if (!validPoint(origin) || !validPoint(destination)) {
      throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
    }

    try {
      const modeConfig = routeRequestMode(requestedMode);
      const body = {
        origin: {
          location: {
            latLng: { latitude: Number(origin.lat), longitude: Number(origin.lon) },
          },
        },
        destination: {
          location: {
            latLng: { latitude: Number(destination.lat), longitude: Number(destination.lon) },
          },
        },
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
          headers: googleHeaders(ROUTE_FIELDS),
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
      logError('Google route calculation failed.', {
        ...safeError(error),
        mode: requestedMode,
      });
      throw new HttpsError('internal', 'No fue posible calcular esta ruta con Google Routes.');
    }
  }
);
