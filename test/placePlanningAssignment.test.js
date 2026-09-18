// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEARBY_ITINERARY_CITY_MAX_KM,
  distanceKm,
  itineraryPlacePlanningTarget,
} from '../src/modules/trips/placePlanningAssignment.js';
import { createSegment } from '../src/modules/trips/tripModel.js';

function city(id, name, country, countryCode, lat, lon) {
  return { id, name, displayName: `${name}, ${country}`, country, countryCode, lat, lon };
}

const madrid = city('madrid', 'Madrid', 'España', 'ES', 40.4168, -3.7038);
const paris = city('paris', 'Paris', 'France', 'FR', 48.8566, 2.3522);
const munich = city('munich', 'Munich', 'Germany', 'DE', 48.1351, 11.5820);

function segments() {
  return [
    createSegment({
      id: 'madrid-leg',
      destination: madrid,
      startDate: '2026-08-01',
      endDate: '2026-08-02',
    }),
    createSegment({
      id: 'paris-leg',
      destination: paris,
      startDate: '2026-08-03',
      endDate: '2026-08-04',
    }),
  ];
}

test('asigna una coincidencia de ciudad al día 1 de esa visita', () => {
  const target = itineraryPlacePlanningTarget({
    city: 'Madrid',
    country: 'Spain',
    countryCode: 'ES',
    lat: 40.415,
    lon: -3.69,
  }, segments());

  assert.equal(target?.reason, 'city');
  assert.equal(target?.day.segmentId, 'madrid-leg');
  assert.equal(target?.day.dayOffset, 0);
  assert.equal(target?.day.globalDayNumber, 1);
});

test('usa cercanía razonable para excursiones fuera del nombre exacto de la ciudad', () => {
  const target = itineraryPlacePlanningTarget({
    city: 'Versailles',
    country: 'France',
    countryCode: 'FR',
    lat: 48.8049,
    lon: 2.1204,
  }, segments());

  assert.equal(target?.reason, 'nearby');
  assert.equal(target?.day.segmentId, 'paris-leg');
  assert.ok(target.distanceKm < 30);
});

test('permite una excursión amplia como Neuschwanstein dentro del umbral acordado', () => {
  const munichSegments = [createSegment({
    id: 'munich-leg',
    destination: munich,
    startDate: '2026-12-03',
    endDate: '2026-12-05',
  })];
  const target = itineraryPlacePlanningTarget({
    city: 'Schwangau',
    country: 'Germany',
    countryCode: 'DE',
    lat: 47.5576,
    lon: 10.7498,
  }, munichSegments);

  assert.equal(target?.day.segmentId, 'munich-leg');
  assert.equal(target?.day.dayOffset, 0);
  assert.ok(target.distanceKm <= NEARBY_ITINERARY_CITY_MAX_KM);
});

test('no fuerza una ciudad lejana ni de otro país', () => {
  const farAway = itineraryPlacePlanningTarget({
    city: 'Lisbon',
    country: 'Portugal',
    countryCode: 'PT',
    lat: 38.7223,
    lon: -9.1393,
  }, segments());

  assert.equal(farAway, null);
});

test('distanceKm devuelve infinito si faltan coordenadas válidas', () => {
  assert.equal(distanceKm({ lat: null, lon: null }, madrid), Number.POSITIVE_INFINITY);
});
