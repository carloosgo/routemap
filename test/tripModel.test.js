import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCity,
  createSegment,
  isPlaced,
  normalizeTrip,
} from '../src/modules/trips/tripModel.js';

test('createCity conserva coordenadas válidas', () => {
  const city = createCity({ name: 'Ciudad de México', lat: 19.4326, lon: -99.1332 });

  assert.equal(city.lat, 19.4326);
  assert.equal(city.lon, -99.1332);
  assert.equal(isPlaced(city), true);
});

test('createCity no convierte valores vacíos en coordenadas 0,0', () => {
  const city = createCity({ name: 'Sin coordenadas', lat: '', lon: null });

  assert.equal(city.lat, null);
  assert.equal(city.lon, null);
  assert.equal(isPlaced(city), false);
});

test('createCity rechaza coordenadas fuera de rango', () => {
  const city = createCity({ name: 'Inválida', lat: 91, lon: -181 });

  assert.equal(city.lat, null);
  assert.equal(city.lon, null);
  assert.equal(isPlaced(city), false);
});

test('createSegment conserva un identificador existente', () => {
  const segment = createSegment({ id: 'segmento-existente' });

  assert.equal(segment.id, 'segmento-existente');
});

test('normalizeTrip conserva los identificadores de sus segmentos', () => {
  const normalized = normalizeTrip({
    id: 'viaje-1',
    name: 'Europa',
    segments: [
      {
        id: 'segmento-1',
        origin: { name: 'París', lat: 48.8566, lon: 2.3522 },
        destination: { name: 'Bruselas', lat: 50.8503, lon: 4.3517 },
      },
    ],
  });

  assert.equal(normalized.segments[0].id, 'segmento-1');
});
