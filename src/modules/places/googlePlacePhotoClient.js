import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';

const pendingPhotos = new Map();

function cleanText(value, max = 1800) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeHttpsUrl(value) {
  const text = cleanText(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizedAttributions(value) {
  return (Array.isArray(value) ? value : [])
    .map((author) => ({
      displayName: cleanText(author?.displayName, 160),
      uri: safeHttpsUrl(author?.uri),
      photoUri: safeHttpsUrl(author?.photoUri),
    }))
    .filter((author) => author.displayName || author.uri || author.photoUri)
    .slice(0, 4);
}

function normalizedPhoto(value) {
  const uri = safeHttpsUrl(value?.uri);
  const googleMapsUri = safeHttpsUrl(value?.googleMapsUri);
  if (!uri || !googleMapsUri) return null;
  return {
    uri,
    googleMapsUri,
    authorAttributions: normalizedAttributions(value?.authorAttributions),
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export async function loadGooglePlacePhoto(placeId, { signal } = {}) {
  const id = cleanText(placeId, 256);
  if (!id) return null;
  throwIfAborted(signal);

  let pending = pendingPhotos.get(id);
  if (!pending) {
    pending = (async () => {
      const request = firebaseCallable('googlePlacePhoto');
      const response = await request({ placeId: id });
      return normalizedPhoto(response.data?.photo);
    })();
    pendingPhotos.set(id, pending);
    pending.then(
      () => pendingPhotos.delete(id),
      () => pendingPhotos.delete(id)
    );
  }

  const photo = await pending;
  throwIfAborted(signal);
  return photo;
}
