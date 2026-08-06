import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVED_PLACE_ROUTE_MODES,
  createSavedPlaceRoute,
  normalizeRouteGeometry,
  savedPlaceRouteTotals,
} from '../src/modules/routes/routeModel.js';
import {
  TRIP_ACTIONS,
  tripReducer,
} from '../src/modules/trips/tripReducer.js';
import { createPlace, createTrip } from '../src/modules/trips/tripModel.js';

function placesTrip() {
  return {
    ...createTrip('Rutas'),
    places: [
      createPlace({ id: 'rome', name: 'Coliseo', country: 'Italia', countryCode: 'IT', lat: 41.8902, lon: 12.4922 }),
      createPlace({ id: 'trevi', name: 'Fontana di Trevi', country: 'Italia', countryCode: 'IT', lat: 41.9009, lon: 12.4833 }),
      createPlace({ id: 'tokyo', name: 'Tokyo Station', country: 'Japón', countryCode: 'JP', lat: 35.6812, lon: 139.7671 }),
    ],
  };
}

function route(overrides = {}) {
  return {
    id: 'route-1',
    fromPlaceId: 'rome',
    toPlaceId: 'trevi',
    mode: 'drive',
    visible: true,
    distance: 2100,
    duration: 720,
    geometry: {
      type: 'LineString',
      coordinates: [[12.4922, 41.8902], [12.4833, 41.9009]],
    },
    calculatedAt: '2026-08-06T20:00:00.000Z',
    ...overrides,
  };
}

test('solo expone modos que Geoapify Routing soporta para Mis Rutas', () => {
  assert.deepEqual(SAVED_PLACE_ROUTE_MODES, [
    'drive',
    'bus',
    'bicycle',
    'walk',
    'transit',
    'approximated_transit',
  ]);
});

test('normaliza geometrías LineString y MultiLineString válidas', () => {
  assert.deepEqual(
    normalizeRouteGeometry(route().geometry),
    route().geometry
  );
  const multi = {
    type: 'MultiLineString',
    coordinates: [
      [[12.4922, 41.8902], [12.4833, 41.9009]],
      [[12.4833, 41.9009], [12.4964, 41.9028]],
    ],
  };
  assert.deepEqual(normalizeRouteGeometry(multi), multi);
  assert.equal(normalizeRouteGeometry({ type: 'Point', coordinates: [0, 0] }), null);
});

test('el reducer crea una conexión y reemplaza el mismo par al cambiar de modo', () => {
  const state = placesTrip();
  const first = tripReducer(state, {
    type: TRIP_ACTIONS.upsertRouteConnection,
    connection: route(),
  });
  const changed = tripReducer(first, {
    type: TRIP_ACTIONS.upsertRouteConnection,
    connection: route({ id: 'temporary-new-id', mode: 'bicycle', duration: 900 }),
  });

  assert.equal(first.routeConnections.length, 1);
  assert.equal(changed.routeConnections.length, 1);
  assert.equal(changed.routeConnections[0].id, 'route-1');
  assert.equal(changed.routeConnections[0].mode, 'bicycle');
  assert.equal(changed.routeConnections[0].duration, 900);
});

test('ocultar rutas cambia el total visible sin alterar el total calculado', () => {
  const routes = [
    createSavedPlaceRoute(route()),
    createSavedPlaceRoute(route({
      id: 'route-2',
      fromPlaceId: 'trevi',
      toPlaceId: 'tokyo',
      distance: 3000,
      duration: 1200,
      visible: false,
    })),
  ];

  assert.deepEqual(savedPlaceRouteTotals(routes), {
    distance: 5100,
    duration: 1920,
    count: 2,
  });
  assert.deepEqual(savedPlaceRouteTotals(routes, { visibleOnly: true }), {
    distance: 2100,
    duration: 720,
    count: 1,
  });
});

test('eliminar un lugar elimina también sus conexiones dependientes', () => {
  const withRoute = tripReducer(placesTrip(), {
    type: TRIP_ACTIONS.upsertRouteConnection,
    connection: route(),
  });
  const removed = tripReducer(withRoute, {
    type: TRIP_ACTIONS.removePlace,
    placeId: 'rome',
  });

  assert.equal(removed.places.some((place) => place.id === 'rome'), false);
  assert.equal(removed.routeConnections.length, 0);
});
