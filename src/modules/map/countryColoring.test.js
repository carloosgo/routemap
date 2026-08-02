import test from 'node:test';
import assert from 'node:assert/strict';
import { countryLayerStyle, visitedCountries } from './countryColoring.js';

const colors = ['#e23b3b', '#2563eb', '#7c3aed'];
const colorForIndex = (index) => colors[index] || '#000000';

function city(countryCode, lat, lon, name = countryCode) {
  return { countryCode, lat, lon, name };
}

test('derives colored countries only from segment origins and destinations', () => {
  const segments = [
    {
      origin: city('FR', 48.8566, 2.3522, 'Paris'),
      destination: city('DE', 52.52, 13.405, 'Berlin'),
      places: [city('ES', 40.4168, -3.7038, 'Saved place in Madrid')],
    },
  ];

  const result = visitedCountries(segments, colorForIndex);
  assert.deepEqual(result.map((item) => item.countryCode), ['FR', 'DE']);
  assert.equal(result.some((item) => item.countryCode === 'ES'), false);
});

test('keeps the color of the first route segment that visits a country', () => {
  const segments = [
    {
      origin: city('FR', 48.8566, 2.3522),
      destination: city('BE', 50.8503, 4.3517),
    },
    {
      origin: city('BE', 50.8503, 4.3517),
      destination: city('DE', 52.52, 13.405),
    },
  ];

  const result = visitedCountries(segments, colorForIndex);
  const belgium = result.find((item) => item.countryCode === 'BE');
  assert.equal(belgium.color, colors[0]);
});

test('ignores incomplete cities and invalid country codes', () => {
  const segments = [
    {
      origin: city('', 48.8566, 2.3522),
      destination: city('FRA', 43.2965, 5.3698),
    },
    {
      origin: city('ES', Number.NaN, -3.7038),
      destination: city('HU', 47.4979, 19.0402),
    },
  ];

  assert.deepEqual(
    visitedCountries(segments, colorForIndex).map((item) => item.countryCode),
    ['HU']
  );
});

test('renders only the fill and disables Leaflet geometry simplification', () => {
  assert.deepEqual(countryLayerStyle('#2563eb'), {
    stroke: false,
    fillColor: '#2563eb',
    fillOpacity: 0.09,
    fillRule: 'evenodd',
    smoothFactor: 0,
  });
});
