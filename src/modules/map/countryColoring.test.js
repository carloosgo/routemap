import test from 'node:test';
import assert from 'node:assert/strict';
import { visitedCountries } from './countryColoring.js';

const colors = ['#e23b3b', '#2563eb', '#7c3aed'];
const colorForIndex = (index) => colors[index] || '#000000';

function city(countryCode, lat, lon, name = countryCode) {
  return { countryCode, lat, lon, name };
}

test('colors only destination countries and never the trip origin country', () => {
  const segments = [
    {
      origin: city('FR', 48.8566, 2.3522, 'Paris'),
      destination: city('DE', 52.52, 13.405, 'Berlin'),
      places: [city('ES', 40.4168, -3.7038, 'Saved place in Madrid')],
    },
    {
      origin: city('DE', 52.52, 13.405, 'Berlin'),
      destination: city('BE', 50.8503, 4.3517, 'Brussels'),
    },
  ];

  const result = visitedCountries(segments, colorForIndex);
  assert.deepEqual(result.map((item) => item.countryCode), ['DE', 'BE']);
  assert.equal(result.some((item) => item.countryCode === 'FR'), false);
  assert.equal(result.some((item) => item.countryCode === 'ES'), false);
});

test('does not color the map when the trip has only one destination country', () => {
  const segments = [
    {
      origin: city('MX', 19.4326, -99.1332, 'Ciudad de México'),
      destination: city('ES', 41.3874, 2.1686, 'Barcelona'),
    },
    {
      origin: city('ES', 41.3874, 2.1686, 'Barcelona'),
      destination: city('ES', 40.4168, -3.7038, 'Madrid'),
    },
  ];

  assert.deepEqual(visitedCountries(segments, colorForIndex), []);
});

test('keeps the origin country unpainted even when the route returns to it later', () => {
  const segments = [
    {
      origin: city('MX', 19.4326, -99.1332, 'Ciudad de México'),
      destination: city('US', 40.7128, -74.006, 'New York'),
    },
    {
      origin: city('US', 40.7128, -74.006, 'New York'),
      destination: city('MX', 20.6597, -103.3496, 'Guadalajara'),
    },
    {
      origin: city('MX', 20.6597, -103.3496, 'Guadalajara'),
      destination: city('CA', 43.6532, -79.3832, 'Toronto'),
    },
  ];

  assert.deepEqual(
    visitedCountries(segments, colorForIndex).map((item) => item.countryCode),
    ['US', 'CA']
  );
});

test('assigns a different color to each destination country in route order', () => {
  const segments = [
    { origin: city('FR', 48.8566, 2.3522), destination: city('BE', 50.8503, 4.3517) },
    { origin: city('BE', 50.8503, 4.3517), destination: city('DE', 52.52, 13.405) },
    { origin: city('DE', 52.52, 13.405), destination: city('NL', 52.3676, 4.9041) },
  ];

  assert.deepEqual(
    visitedCountries(segments, colorForIndex).map(({ countryCode, color }) => ({ countryCode, color })),
    [
      { countryCode: 'BE', color: colors[0] },
      { countryCode: 'DE', color: colors[1] },
      { countryCode: 'NL', color: colors[2] },
    ]
  );
});

test('skips a repeated palette value for the next destination country', () => {
  const repeatedPalette = ['#e23b3b', '#e23b3b', '#2563eb'];
  const repeatedColorForIndex = (index) => repeatedPalette[index] || '#7c3aed';
  const segments = [
    {
      origin: city('FR', 48.8566, 2.3522),
      destination: city('DE', 52.52, 13.405),
    },
    {
      origin: city('DE', 52.52, 13.405),
      destination: city('BE', 50.8503, 4.3517),
    },
  ];

  const [germany, belgium] = visitedCountries(segments, repeatedColorForIndex);
  assert.equal(germany.color, '#e23b3b');
  assert.equal(belgium.color, '#2563eb');
});

test('ignores invalid destination coordinates and invalid country codes', () => {
  const segments = [
    { origin: city('MX', 19.4326, -99.1332), destination: city('FRA', 48.8566, 2.3522) },
    { origin: city('FR', 48.8566, 2.3522), destination: city('DE', 120, 13.405) },
    { origin: city('DE', 52.52, 13.405), destination: city('NL', 52.3676, 4.9041) },
    { origin: city('NL', 52.3676, 4.9041), destination: city('BE', 50.8503, 4.3517) },
  ];

  assert.deepEqual(
    visitedCountries(segments, colorForIndex).map((item) => item.countryCode),
    ['NL', 'BE']
  );
});
