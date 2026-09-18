// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/app/ItineraryPdfExport.jsx'), 'utf8');

test('exportación de itinerario usa Google Static Maps y no captura de pantalla ni Geoapify', () => {
  assert.match(source, /loadCurrentGoogleStaticMap/);
  assert.match(source, /composeItineraryStaticMap/);
  assert.doesNotMatch(source, /captureExactItineraryMap/);
  assert.doesNotMatch(source, /loadItineraryStaticMap/);
});
