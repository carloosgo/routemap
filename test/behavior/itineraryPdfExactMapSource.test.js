// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/app/ItineraryPdfExport.jsx'), 'utf8');

test('exportación de itinerario usa captura literal de la pestaña y no un mapa estático aproximado', () => {
  assert.match(source, /captureExactItineraryMap/);
  assert.doesNotMatch(source, /loadItineraryStaticMap/);
  assert.doesNotMatch(source, /composeItineraryStaticMap/);
});
