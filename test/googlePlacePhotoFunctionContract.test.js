// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Google Place Photo no expone la clave y solicita sólo photos antes del media', async () => {
  const server = await read('functions/googlePlacePhotoFunction.js');
  const client = await read('src/modules/places/googlePlacePhotoClient.js');

  assert.match(server, /const PHOTO_FIELDS = 'photos'/);
  assert.match(server, /'X-Goog-Api-Key': key/);
  assert.match(server, /skipHttpRedirect: 'true'/);
  assert.match(server, /return \{\s*photo: \{\s*uri,/s);
  assert.doesNotMatch(client, /GOOGLE_PLACES_API_KEY|X-Goog-Api-Key|places\.googleapis\.com/);
});
