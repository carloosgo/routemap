// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCountryFlag } from '../../src/modules/export/countryFlagVector.js';
import { createItineraryMapProjection } from '../../src/modules/export/itineraryPdfVector.js';

test('el mapa PDF conserva una proyección vertical legible para un itinerario europeo', () => {
  const entries = [
    { name: 'París', lat: 48.8566, lon: 2.3522 },
    { name: 'Gante', lat: 51.0543, lon: 3.7174 },
    { name: 'Ámsterdam', lat: 52.3676, lon: 4.9041 },
    { name: 'Berlín', lat: 52.52, lon: 13.405 },
    { name: 'Múnich', lat: 48.1351, lon: 11.582 },
    { name: 'Barcelona', lat: 41.3874, lon: 2.1686 },
    { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  ];
  const box = { x: 0, y: 0, width: 520, height: 420 };
  const projection = createItineraryMapProjection(entries, box);
  const points = entries.map((entry) => projection.project(entry.lon, entry.lat));
  const ys = points.map((point) => point[1]);
  const verticalSpan = Math.max(...ys) - Math.min(...ys);

  assert.ok(verticalSpan > 200, `expected a useful vertical map span, got ${verticalSpan}`);
});

test('las banderas del itinerario se dibujan como geometría vectorial y no como códigos ISO', () => {
  const calls = [];
  const page = {
    rect(x, y, width, height, options = {}) {
      calls.push({ type: 'rect', x, y, width, height, ...options });
    },
    circle(x, y, radius, options = {}) {
      calls.push({ type: 'circle', x, y, radius, ...options });
    },
    text(value) {
      calls.push({ type: 'text', value });
    },
  };

  drawCountryFlag(page, 'FR', 0, 0, 15, 10);
  const fills = calls.filter((call) => call.type === 'rect' && call.fill).map((call) => call.fill);

  assert.ok(fills.includes('#0055A4'));
  assert.ok(fills.includes('#FFFFFF'));
  assert.ok(fills.includes('#EF4135'));
  assert.equal(calls.some((call) => call.type === 'text' && call.value === 'FR'), false);
});
