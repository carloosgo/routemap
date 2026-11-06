// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itineraryMapViewport,
  projectToStaticMap,
} from '../../src/modules/export/itineraryStaticMapViewport.js';

const EUROPE_ROUTE = [
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Gante', lat: 51.0543, lon: 3.7174 },
  { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  { name: 'Berlin', lat: 52.52, lon: 13.405 },
  { name: 'Munich', lat: 48.1351, lon: 11.582 },
  { name: 'Barcelona', lat: 41.3874, lon: 2.1686 },
  { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
];

test('el viewport estatico mantiene todo el itinerario visible con margen', () => {
  const viewport = itineraryMapViewport(EUROPE_ROUTE);
  assert.ok(viewport.zoom > 3 && viewport.zoom < 7);
  EUROPE_ROUTE.forEach((city) => {
    const [x, y] = projectToStaticMap(city.lon, city.lat, viewport);
    assert.ok(x >= 35 && x <= viewport.width - 35, `${city.name} x=${x}`);
    assert.ok(y >= 35 && y <= viewport.height - 35, `${city.name} y=${y}`);
  });
});

test('las visitas repetidas conservan exactamente la misma posicion', () => {
  const viewport = itineraryMapViewport(EUROPE_ROUTE);
  const first = projectToStaticMap(2.3522, 48.8566, viewport);
  const second = projectToStaticMap(2.3522, 48.8566, viewport);
  assert.deepEqual(first, second);
});