import test from 'node:test';
import assert from 'node:assert/strict';
import { visitedCountries } from './countryColoring.js';

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

test('assigns a different color to each next country in route order', () => {
  const segments = [
    { origin: city('FR', 48.8566, 2.3522), destination: city('BE', 50.8503, 4.3517) },
    { origin: city('BE', 50.8503, 4.3517), destination: city('DE', 52.52, 13.405) },
  ];

  assert.deepEqual(
    visitedCountries(segments, colorForIndex).map(({ countryCode, color }) => ({ countryCode, color })),
    [
      { countryCode: 'FR', color: colors[0] },
      { countryCode: 'BE', color: colors[1] },
      { countryCode: 'DE', color: colors[2] },
    ]
  );
});

test('skips a repeated palette value for the next country', () => {
  const repeatedPalette = ['#e23b3b', '#e23b3b', '#2563eb'];
  const repeatedColorForIndex = (index) => repeatedPalette[index] || '#7c3aed';
  const segments = [{
    origin: city('FR', 48.8566, 2.3522),
    destination: city('DE', 52.52, 13.405),
  }];

  const [france, germany] = visitedCountries(segments, repeatedColorForIndex);
  assert.equal(france.color, '#e23b3b');
  assert.equal(germany.color, '#2563eb');
});

test('ignores invalid coordinates and invalid country codes', () => {
  const segments = [
    { origin: city('FRA', 48.8566, 2.3522), destination: city('DE', 120, 13.405) },
    { origin: city('NL', 52.3676, 4.9041), destination: city('BE', 50.8503, 4.3517) },
  ];

  assert.deepEqual(
    visitedCountries(segments, colorForIndex).map((item) => item.countryCode),
    ['NL', 'BE']
  );
});
