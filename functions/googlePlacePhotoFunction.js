import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_PLACES_API_KEY, QUOTAS, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError } from './geoapifySupport.js';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const PHOTO_FIELDS = 'photos';
const PHOTO_MAX_WIDTH = 192;
const PHOTO_MAX_HEIGHT = 128;

function cleanText(value, max = 800) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function requireGooglePlacesKey() {
  const key = GOOGLE_PLACES_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_PLACES_API_KEY.');
  }
  return key;
}

function validHttpsUrl(value, max = 1800) {
  const text = cleanText(value, max);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function validPhotoName(value, placeId) {
  const name = cleanText(value, 900);
  const expectedPrefix = `places/${placeId}/photos/`;
  return name.startsWith(expectedPrefix) && name.length > expectedPrefix.length
    ? name
    : '';
}

function mapAuthorAttributions(value) {
  return (Array.isArray(value) ? value : [])
    .map((author) => ({
      displayName: cleanText(author?.displayName, 160),
      uri: validHttpsUrl(author?.uri),
      photoUri: validHttpsUrl(author?.photoUri),
    }))
    .filter((author) => author.displayName || author.uri || author.photoUri)
    .slice(0, 4);
}

export const googlePlacePhoto = onCall(
  callableOptions({
    secrets: [GOOGLE_PLACES_API_KEY],
    enforceAppCheck: false,
    maxInstances: 4,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googlePlacePhoto);
    const placeId = cleanText(request.data?.placeId, 256);
    if (!placeId) {
      throw new HttpsError('invalid-argument', 'El lugar de Google es inválido.');
    }

    try {
      const key = requireGooglePlacesKey();
      const details = await limitedFetch(
        `${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': PHOTO_FIELDS,
          },
        },
        'Google Place photo metadata'
      );

      const photo = (Array.isArray(details?.photos) ? details.photos : [])
        .find((candidate) => (
          validPhotoName(candidate?.name, placeId)
          && validHttpsUrl(candidate?.googleMapsUri)
        ));
      if (!photo) return { photo: null };

      const photoName = validPhotoName(photo.name, placeId);
      const googleMapsUri = validHttpsUrl(photo.googleMapsUri);
      const params = new URLSearchParams({
        maxWidthPx: String(PHOTO_MAX_WIDTH),
        maxHeightPx: String(PHOTO_MAX_HEIGHT),
        skipHttpRedirect: 'true',
      });
      const media = await limitedFetch(
        `${GOOGLE_PLACES_BASE}/${photoName}/media?${params}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
          },
        },
        'Google Place photo'
      );
      const uri = validHttpsUrl(media?.photoUri);
      if (!uri) return { photo: null };

      return {
        photo: {
          uri,
          googleMapsUri,
          authorAttributions: mapAuthorAttributions(photo?.authorAttributions),
        },
      };
    } catch (error) {
      logError('Google Place Photo failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible obtener la foto del lugar.');
    }
  }
);
