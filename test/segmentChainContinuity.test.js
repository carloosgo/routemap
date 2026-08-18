import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIP_ACTIONS, tripReducer } from '../src/modules/trips/tripReducer.js';
import { createSegment, createTrip } from '../src/modules/trips/tripModel.js';

const city = (id, name) => ({
  id,
  name,
  displayName: name,
  country: 'México',
  countryCode: 'MX',
  lat: 19,
  lon: -99,
});

function chainedTrip() {
  const origin = city('origin', 'Ciudad de México');
  const paris = city('paris', 'Paris');
  const berlin = city('berlin', 'Berlin');
  const amsterdam = city('amsterdam', 'Amsterdam');
  return {
    ...createTrip('Europa'),
    segments: [
      createSegment({ id: 'segment-1', origin, destination: paris }),
      createSegment({ id: 'segment-2', origin: paris, destination: berlin }),
      createSegment({ id: 'segment-3', origin: berlin, destination: amsterdam }),
    ],
  };
}

test('cambiar un destino actualiza el origen canónico del trayecto siguiente', () => {
  const state = chainedTrip();
  const lyon = city('lyon', 'Lyon');
  const next = tripReducer(state, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'segment-1',
    patch: { destination: lyon },
  });

  assert.deepEqual(next.segments[0].origin, state.segments[0].origin);
  assert.deepEqual(next.segments[1].origin, lyon);
  assert.deepEqual(next.segments[2].origin, next.segments[1].destination);
});

test('editar el origen inicial no crea selectores de origen independientes', () => {
  const state = chainedTrip();
  const monterrey = city('monterrey', 'Monterrey');
  const next = tripReducer(state, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'segment-1',
    patch: { origin: monterrey },
  });

  assert.deepEqual(next.segments[0].origin, monterrey);
  assert.deepEqual(next.segments[1].origin, next.segments[0].destination);
  assert.deepEqual(next.segments[2].origin, next.segments[1].destination);
});

test('reordenar y eliminar conservan un único origen inicial y reencadenan la ruta', () => {
  const state = chainedTrip();
  const reordered = tripReducer(state, {
    type: TRIP_ACTIONS.reorderSegment,
    sourceId: 'segment-3',
    targetId: 'segment-1',
    placement: 'before',
  });

  assert.deepEqual(reordered.segments[0].origin, state.segments[0].origin);
  assert.deepEqual(reordered.segments[1].origin, reordered.segments[0].destination);
  assert.deepEqual(reordered.segments[2].origin, reordered.segments[1].destination);

  const removed = tripReducer(reordered, {
    type: TRIP_ACTIONS.removeSegment,
    segmentId: reordered.segments[1].id,
  });
  assert.deepEqual(removed.segments[0].origin, state.segments[0].origin);
  assert.deepEqual(removed.segments[1].origin, removed.segments[0].destination);
});
