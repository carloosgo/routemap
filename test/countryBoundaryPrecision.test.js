import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countryFillStyleState } from '../src/modules/map/countryColoring.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('el flujo activo de mapas usa Google y ya no monta MapLibre u Overture', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(routeMap, /<GooglePlacesMap/);
  assert.match(googleMap, /loadGoogleMaps\(\)/);
  assert.match(googleMap, /mapId: config\.googleMaps\.mapId/);
  assert.doesNotMatch(routeMap, /ItineraryRouteMap|maplibregl|pmtiles|Overture/);
  assert.doesNotMatch(googleMap, /maplibregl|pmtiles|Overture|createGeoapifyStyleUrl/);
});

test('la lógica histórica de colores de país sigue siendo determinista mientras se migra su visualización a Google', () => {
  const segments = [
    {
      origin: { countryCode: 'FR', lat: 48.8566, lon: 2.3522 },
      destination: { countryCode: 'DE', lat: 52.52, lon: 13.405 },
    },
    {
      origin: { countryCode: 'DE', lat: 52.52, lon: 13.405 },
      destination: { countryCode: 'NL', lat: 52.3676, lon: 4.9041 },
    },
  ];
  const colors = ['#e23b3b', '#2563eb', '#7c3aed'];
  const state = countryFillStyleState(segments, (index) => colors[index]);

  assert.deepEqual(state.filter, [
    'all',
    ['==', ['get', 'subtype'], 'country'],
    ['==', ['get', 'class'], 'land'],
    ['in', ['get', 'country'], ['literal', ['FR', 'DE', 'NL']]],
  ]);
  assert.deepEqual(state.colorExpression, [
    'match',
    ['get', 'country'],
    'FR', '#f84e4e',
    'DE', '#3a78ff',
    'NL', '#9151ff',
    'transparent',
  ]);
});
