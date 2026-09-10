import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./googlePlacePhotoFunction.js', import.meta.url), 'utf8');

test('googlePlacePhoto usa Places New photos y media sin cache persistente', () => {
  assert.match(source, /const PHOTO_FIELDS = 'photos'/);
  assert.match(source, /skipHttpRedirect: 'true'/);
  assert.match(source, /validHttpsUrl\(candidate\?\.googleMapsUri\)/);
  assert.match(source, /GOOGLE_PLACES_API_KEY/);
  assert.doesNotMatch(source, /cached\(|cacheDb|sharedCache/);
});
