// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIP_ACTIONS, tripReducer } from '../../src/modules/trips/tripReducer.js';
import { createSegment, createTrip } from '../../src/modules/trips/tripModel.js';
import { itineraryMapProjection } from '../../src/modules/map/itineraryMapProjection.js';
import { buildMapFeatureData } from '../../src/modules/map/routeMapModel.js';

const CITY_COORDINATES = {
  origin: [19.4326, -99.1332],
  paris: [48.8566, 2.3522],
  berlin: [52.52, 13.405],
  amsterdam: [52.3676, 4.9041],
  lyon: [45.764, 4.8357],
  monterrey: [25.6866, -100.3161],
};

const city = (id, name) => {
  const [lat, lon] = CITY_COORDINATES[id];
  return { id, name, displayName: name, country: 'México', countryCode: 'MX', lat, lon };
};

function chainedTrip() {
  const origin = city('origin', 'Ciudad de México');
  const paris = city('paris', 'Paris');
  const berlin = city('berlin', 'Berlin');
  const amsterdam = city('amsterdam', 'Amsterdam');
  return {
    ...createTrip('Europa'),
    origin,
    segments: [
      createSegment({ id: 'segment-1', destination: paris }),
      createSegment({ id: 'segment-2', destination: berlin }),
      createSegment({ id: 'segment-3', destination: amsterdam }),
    ],
  };
}

function projectedSegments(trip) {
  return itineraryMapProjection(trip.origin, trip.segments);
}

test('cambiar un destino actualiza el origen derivado del trayecto siguiente', () => {
  const state = chainedTrip();
  const lyon = city('lyon', 'Lyon');
  const next = tripReducer(state, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'segment-1',
    patch: { destination: lyon },
  });

  assert.deepEqual(next.origin, state.origin);
  assert.ok(next.segments.every((segment) => !Object.hasOwn(segment, 'origin')));
  const projected = projectedSegments(next);
  assert.deepEqual(projected[0].origin, next.origin);
  assert.deepEqual(projected[1].origin, lyon);
  assert.deepEqual(projected[2].origin, next.segments[1].destination);
});

test('editar el origen inicial usa trip.origin y no crea origenes independientes por segmento', () => {
  const state = chainedTrip();
  const monterrey = city('monterrey', 'Monterrey');
  const next = tripReducer(state, {
    type: TRIP_ACTIONS.updateOrigin,
    origin: monterrey,
  });

  assert.deepEqual(next.origin, monterrey);
  assert.ok(next.segments.every((segment) => !Object.hasOwn(segment, 'origin')));
  const projected = projectedSegments(next);
  assert.deepEqual(projected[0].origin, monterrey);
  assert.deepEqual(projected[1].origin, next.segments[0].destination);
  assert.deepEqual(projected[2].origin, next.segments[1].destination);
});

test('un patch legacy de origin sobre un segmento se ignora', () => {
  const state = chainedTrip();
  const monterrey = city('monterrey', 'Monterrey');
  const next = tripReducer(state, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'segment-1',
    patch: { origin: monterrey },
  });

  assert.deepEqual(next.origin, state.origin);
  assert.ok(next.segments.every((segment) => !Object.hasOwn(segment, 'origin')));
});

test('reordenar y eliminar conservan un único origen inicial y derivan la ruta', () => {
  const state = chainedTrip();
  const reordered = tripReducer(state, {
    type: TRIP_ACTIONS.reorderSegment,
    sourceId: 'segment-3',
    targetId: 'segment-1',
    placement: 'before',
  });

  assert.deepEqual(reordered.origin, state.origin);
  assert.ok(reordered.segments.every((segment) => !Object.hasOwn(segment, 'origin')));
  const reorderedProjection = projectedSegments(reordered);
  assert.deepEqual(reorderedProjection[0].origin, state.origin);
  assert.deepEqual(reorderedProjection[1].origin, reordered.segments[0].destination);
  assert.deepEqual(reorderedProjection[2].origin, reordered.segments[1].destination);

  const removed = tripReducer(reordered, {
    type: TRIP_ACTIONS.removeSegment,
    segmentId: reordered.segments[1].id,
  });
  assert.deepEqual(removed.origin, state.origin);
  assert.ok(removed.segments.every((segment) => !Object.hasOwn(segment, 'origin')));
  assert.deepEqual(projectedSegments(removed)[1].origin, removed.segments[0].destination);
});

test('eliminar un tramo intermedio reconecta destinos y renumera mapa y trazos consecutivamente', () => {
  const state = chainedTrip();
  const removed = tripReducer(state, {
    type: TRIP_ACTIONS.removeSegment,
    segmentId: 'segment-2',
  });
  assert.deepEqual(removed.segments.map((segment) => segment.id), ['segment-1', 'segment-3']);
  assert.equal(removed.segments[0].destination.id, 'paris');
  assert.equal(projectedSegments(removed)[1].origin.id, 'paris');
  assert.equal(removed.segments[1].destination.id, 'amsterdam');

  const mapData = buildMapFeatureData({
    segments: projectedSegments(removed),
    places: [],
    routeConnections: [],
    viewMode: 'segments',
    colorForIndex: (index) => `color-${index}`,
  });
  assert.deepEqual(mapData.routeFeatures.map((feature) => feature.properties.segmentId), ['segment-1', 'segment-3']);
  assert.deepEqual(mapData.routeFeatures.map((feature) => feature.properties.sequence), [1, 2]);
  assert.deepEqual(mapData.cityFeatures.map((feature) => feature.properties.name), ['Ciudad de México', 'Paris', 'Amsterdam']);
  assert.deepEqual(mapData.cityFeatures.map((feature) => feature.properties.sequence), [null, 1, 2]);
});
