// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Mis Rutas reemplaza Street View por una foto real de Google Places', async () => {
  const compatibilityWrapper = await read('src/modules/places/StreetViewThumbnail.jsx');
  const thumbnail = await read('src/modules/places/PlacePhotoThumbnail.jsx');
  const client = await read('src/modules/places/googlePlacePhotoClient.js');

  assert.match(compatibilityWrapper, /PlacePhotoThumbnail/);
  assert.doesNotMatch(compatibilityWrapper, /streetview\?size|maps\/api\/streetview/);

  assert.match(thumbnail, /loadGooglePlacePhoto\(placeId/);
  assert.match(thumbnail, /const Observer = globalThis\.IntersectionObserver;/);
  assert.match(thumbnail, /rootMargin: '160px 0px'/);
  assert.match(thumbnail, /loading="lazy"/);
  assert.match(thumbnail, /objectFit: 'cover'/);
  assert.match(thumbnail, /width="72"/);
  assert.match(thumbnail, /height="48"/);
  assert.match(thumbnail, /translate="no"[^>]*>Google Maps/);
  assert.match(thumbnail, /href=\{photo\.googleMapsUri/);
  assert.doesNotMatch(thumbnail, /localStorage|sessionStorage|indexedDB|fetch\(/);

  assert.match(client, /firebaseCallable\('googlePlacePhoto'\)/);
  assert.match(client, /const pendingPhotos = new Map\(\)/);
  assert.match(client, /if \(!uri \|\| !googleMapsUri\) return null/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB/);
});

test('el backend obtiene metadata gratis y sirve sólo una Place Photo dimensionada', async () => {
  const server = await read('functions/googlePlacePhotoFunction.js');
  const runtime = await read('functions/geoapifyRuntime.js');
  const index = await read('functions/index.js');
  const manifest = await read('functions/callableManifest.js');

  assert.match(server, /const PHOTO_FIELDS = 'photos'/);
  assert.match(server, /'X-Goog-FieldMask': PHOTO_FIELDS/);
  assert.match(server, /GOOGLE_PLACES_API_KEY/);
  assert.match(server, /QUOTAS\.googlePlacePhoto/);
  assert.match(server, /maxWidthPx: String\(PHOTO_MAX_WIDTH\)/);
  assert.match(server, /maxHeightPx: String\(PHOTO_MAX_HEIGHT\)/);
  assert.match(server, /skipHttpRedirect: 'true'/);
  assert.match(server, /\$\{GOOGLE_PLACES_BASE\}\/\$\{photoName\}\/media/);
  assert.match(server, /validHttpsUrl\(candidate\?\.googleMapsUri\)/);
  assert.match(server, /authorAttributions: mapAuthorAttributions/);
  assert.doesNotMatch(server, /sharedCache|cached\(/);

  assert.match(runtime, /googlePlacePhoto: \{ scope: 'google-place-photo', maxRequests: 24/);
  assert.match(index, /export \{ googlePlacePhoto \} from '\.\/googlePlacePhotoFunction\.js'/);
  assert.match(manifest, /name: 'googlePlacePhoto', file: 'googlePlacePhotoFunction\.js'/);
});

test('el cliente no conserva photoUri ni photo name fuera de la solicitud en curso', async () => {
  const client = await read('src/modules/places/googlePlacePhotoClient.js');
  const server = await read('functions/googlePlacePhotoFunction.js');

  assert.match(client, /pending\.finally\(\(\) => pendingPhotos\.delete\(id\)\)/);
  assert.doesNotMatch(client, /memoryCache|expiresAt|setItem\(|CacheStorage/);
  assert.doesNotMatch(server, /cacheDb|sharedCache|expiresAt|setItem\(/);
});
