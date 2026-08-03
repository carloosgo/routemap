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

test('builds the MapLibre filter and color expression with ISO alpha-3 codes', () => {
  const segments = [
    { origin: city('FR', 48.8566, 2.3522), destination: city('DE', 52.52, 13.405) },
    { origin: city('DE', 52.52, 13.405), destination: city('NL', 52.3676, 4.9041) },
  ];

  assert.deepEqual(countryFillStyleState(segments, colorForIndex), {
    filter: [
      'in',
      ['get', 'iso_3166_1_alpha_3'],
      ['literal', ['FRA', 'DEU', 'NLD']],
    ],
    colorExpression: [
      'match',
      ['get', 'iso_3166_1_alpha_3'],
      'FRA', colors[0],
      'DEU', colors[0],
      'NLD', colors[1],
      'transparent',
    ],
  });
});

test('uses an empty MapLibre filter when no valid country is present', () => {
  assert.deepEqual(countryFillStyleState([], colorForIndex), {
    filter: [
      '==',
      ['get', 'iso_3166_1_alpha_3'],
      '__NO_VISITED_COUNTRIES__',
    ],
    colorExpression: 'transparent',
  });
});
