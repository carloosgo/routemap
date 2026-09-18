import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_PLACES_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError } from './geoapifySupport.js';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const DETAILS_FIELDS = [
  'id',
  'formattedAddress',
  'location',
  'addressComponents',
].join(',');

function requireGooglePlacesKey() {
  const key = GOOGLE_PLACES_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_PLACES_API_KEY.');
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

function mapPlace(place, fallbackName) {
  const lat = Number(place?.location?.latitude);
  const lon = Number(place?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const components = place?.addressComponents || [];
  const placeId = cleanText(place?.id, 256);
  return {
    id: placeId,
    provider: 'google',
    googlePlaceId: placeId,
    name: cleanText(fallbackName || 'Lugar', 160),
    address: cleanText(place?.formattedAddress, 260),
    city: addressPart(components, 'locality', ['postal_town', 'administrative_area_level_2']),
    country: addressPart(components, 'country'),
    countryCode: countryCode(components),
    category: '',
    lat,
    lon,
  };
}

export const googlePlaceDetailsEssentials = onCall(
  callableOptions({
    secrets: [GOOGLE_PLACES_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googlePlaceDetails);
    const placeId = cleanText(request.data?.placeId, 256);
    const sessionToken = validSessionToken(request.data?.sessionToken);
    const fallbackName = cleanText(request.data?.name, 160);
    if (!placeId || !sessionToken) {
      throw new HttpsError('invalid-argument', 'El lugar o la sesión son inválidos.');
    }

    try {
      const params = new URLSearchParams({
        sessionToken,
        languageCode: validLanguage(request.data?.language),
      });
      const payload = await limitedFetch(
        `${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}?${params}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': requireGooglePlacesKey(),
            'X-Goog-FieldMask': DETAILS_FIELDS,
          },
        },
        'Google Places Essentials'
      );
      const place = mapPlace(payload, fallbackName);
      if (!place) throw new Error('Google Places no devolvió coordenadas válidas.');
      return { place };
    } catch (error) {
      logError('Google Place Details Essentials failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible obtener el lugar de Google Places.');
    }
  }
);
