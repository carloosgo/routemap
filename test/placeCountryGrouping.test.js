import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACE_ORDER_VERSION,
  contiguousPlaceGroups,
  normalizeTrip,
} from '../src/modules/trips/tripModel.js';
import {
  TRIP_ACTIONS,
  tripReducer,
} from '../src/modules/trips/tripReducer.js';

function place(id, countryCode, country, city, lat, lon) {
  return {
    id,
    name: id,
    address: '',
    city,
    country,
    countryCode,
    category: '',
    lat,
    lon,
    savedAt: '2026-08-06T00:00:00.000Z',
  };
}

const italyOne = place('italy-1', 'IT', 'Italia', 'Roma', 41.9028, 12.4964);
const japanOne = place('japan-1', 'JP', 'Japón', 'Tokio', 35.6762, 139.6503);
const italyTwo = place('italy-2', 'IT', 'Italia', 'Florencia', 43.7696, 11.2558);

test('los viajes anteriores agrupan lugares del mismo país conservando su orden interno', () => {
  const trip = normalizeTrip({
    id: 'legacy-country-order',
    places: [italyOne, japanOne, italyTwo],
  });

  assert.equal(trip.placeOrderVersion, PLACE_ORDER_VERSION);
  assert.deepEqual(
    trip.places.map((savedPlace) => savedPlace.id),
    ['italy-1', 'italy-2', 'japan-1']
  );
  assert.deepEqual(
    contiguousPlaceGroups(trip.places).map((group) => group.countryKey),
    ['code:IT', 'code:JP']
  );
});

test('un lugar nuevo se inserta junto al último bloque existente de su país', () => {
  const trip = normalizeTrip({
    id: 'new-country-order',
    placeOrderVersion: PLACE_ORDER_VERSION,
    places: [italyOne, japanOne],
  });
  const next = tripReducer(trip, {
    type: TRIP_ACTIONS.addPlace,
    place: italyTwo,
  });

  assert.deepEqual(
    next.places.map((savedPlace) => savedPlace.id),
    ['italy-1', 'italy-2', 'japan-1']
  );
});

test('un país solo forma otro módulo cuando otro país queda entre sus lugares', () => {
  const trip = normalizeTrip({
    id: 'split-country-order',
    placeOrderVersion: PLACE_ORDER_VERSION,
    places: [italyOne, italyTwo, japanOne],
  });

  const stillGrouped = tripReducer(trip, {
    type: TRIP_ACTIONS.reorderPlace,
    sourceId: 'italy-2',
    targetId: 'japan-1',
    placement: 'before',
  });
  assert.deepEqual(
    contiguousPlaceGroups(stillGrouped.places).map((group) => group.countryKey),
    ['code:IT', 'code:JP']
  );

  const split = tripReducer(trip, {
    type: TRIP_ACTIONS.reorderPlace,
    sourceId: 'italy-2',
    targetId: 'japan-1',
    placement: 'after',
  });
  assert.deepEqual(
    split.places.map((savedPlace) => savedPlace.id),
    ['italy-1', 'japan-1', 'italy-2']
  );
  assert.deepEqual(
    contiguousPlaceGroups(split.places).map((group) => group.countryKey),
    ['code:IT', 'code:JP', 'code:IT']
  );
});

test('un orden separado por el usuario se conserva al volver a normalizar el viaje', () => {
  const reopened = normalizeTrip({
    id: 'persisted-country-order',
    placeOrderVersion: PLACE_ORDER_VERSION,
    places: [italyOne, japanOne, italyTwo],
  });

  assert.deepEqual(
    reopened.places.map((savedPlace) => savedPlace.id),
    ['italy-1', 'japan-1', 'italy-2']
  );
  assert.deepEqual(
    contiguousPlaceGroups(reopened.places).map((group) => group.countryKey),
    ['code:IT', 'code:JP', 'code:IT']
  );
});
