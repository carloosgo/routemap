import test from 'node:test';
import assert from 'node:assert/strict';
import { countryFillStyleState, visitedCountries } from './countryColoring.js';

const colors = ['#e23b3b', '#2563eb', '#7c3aed'];
const colorForIndex = (index) => colors[index] || '#000000';

function city(countryCode, lat, lon, name = countryCode) {
  return { countryCode, lat, lon, name };
}

test('derives colored countries only from segment origins and destinations', () => {
  const segments = [{
    origin: city('FR', 48.8566, 2.3522, 'Paris'),
    destination: city('DE', 52.52, 13.405, 'Berlin'),
    places: [city('ES', 40.4168, -3.7038, 'Saved place in Madrid')],
  }];

  const result = visitedCountries(segments, colorForIndex);
  assert.deepEqual(result.map((item) => item.countryCode), ['FR', 'DE']);
  assert.equal(result.some((item) => item.countryCode === 'ES'), false);
});

test('keeps the color of the first route segment that visits a country', () => {
  const segments = [
    { origin: city('FR', 48.8566, 2.3522), destination: city('BE', 50.8503, 4.3517) },
    { origin: city('BE', 50.8503, 4.3517), destination: city('DE', 52.52, 13.405) },
  ];

  const belgium = visitedCountries(segments, colorForIndex)
    .find((item) => item.countryCode === 'BE');
  assert.equal(belgium.color, colors[0]);
});

test('builds the MapLibre filter for Overture land country polygons', () => {
  const segments = [
    { origin: city('FR', 48.8566, 2.3522), destination: city('DE', 52.52, 13.405) },
    { origin: city('DE', 52.52, 13.405), destination: city('NL', 52.3676, 4.9041) },
  ];

  assert.deepEqual(countryFillStyleState(segments, colorForIndex), {
    filter: [
      'all',
      ['==', ['get', 'subtype'], 'country'],
      ['==', ['get', 'is_land'], true],
      ['in', ['get', 'country'], ['literal', ['FR', 'DE', 'NL']]],
    ],
    colorExpression: [
      'match',
      ['get', 'country'],
      'FR', colors[0],
      'DE', colors[0],
      'NL', colors[1],
      'transparent',
    ],
  });
});

test('uses an empty Overture country filter when no valid country is present', () => {
  assert.deepEqual(countryFillStyleState([], colorForIndex), {
    filter: [
      'all',
      ['==', ['get', 'subtype'], 'country'],
      ['==', ['get', 'is_land'], true],
      ['==', ['get', 'country'], '__NO_VISITED_COUNTRIES__'],
    ],
    colorExpression: 'transparent',
  });
});
