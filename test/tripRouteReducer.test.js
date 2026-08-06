import test from 'node:test';
import assert from 'node:assert/strict';

import { createSegment, createTrip } from '../src/modules/trips/tripModel.js';
import {
  TRIP_ACTIONS,
  tripReducer,
} from '../src/modules/trips/tripReducer.js';
import {
  normalizeSegmentRoute,
  routeModeForSegment,
  routeSignatureForSegment,
} from '../src/modules/trips/segmentRouteModel.js';

function stateWithRoute() {
  const segment = createSegment({
    id: 'segment-1',
    origin: { name: 'París', lat: 48.8566, lon: 2.3522 },
    destination: { name: 'Bruselas', lat: 50.8503, lon: 4.3517 },
    expenses: { transport: { train: 100 } },
  });
  const route = normalizeSegmentRoute({
    signature: routeSignatureForSegment(segment),
    mode: routeModeForSegment(segment),
    geometry: {
      type: 'LineString',
      coordinates: [[2.3522, 48.8566], [4.3517, 50.8503]],
    },
    distance: 312000,
    duration: 6600,
    calculatedAt: '2026-08-05T00:00:00.000Z',
  }, segment);
  return {
    ...createTrip('Europa'),
    segments: [{ ...segment, route }],
  };
}

function update(state, patch) {
  return tripReducer(state, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'segment-1',
    patch,
  });
}

test('el reducer conserva la ruta al editar datos ajenos a la firma', () => {
  const state = stateWithRoute();
  const updated = update(state, {
    note: 'Reserva confirmada',
    startDate: '2026-12-01',
  });

  assert.equal(
    updated.segments[0].route.signature,
    state.segments[0].route.signature
  );
});

test('el reducer descarta rutas al cambiar coordenadas', () => {
  const state = stateWithRoute();
  const updated = update(state, {
    destination: { ...state.segments[0].destination, lon: 4.5 },
  });

  assert.equal(updated.segments[0].route, null);
});

test('cambiar importes conserva la ruta mientras el modo siga siendo transit', () => {
  const state = stateWithRoute();
  const current = state.segments[0];
  const updated = tripReducer(state, {
    type: TRIP_ACTIONS.updateExpenses,
    segmentId: 'segment-1',
    expenses: {
      ...current.expenses,
      transport: { ...current.expenses.transport, train: 250 },
    },
  });

  assert.equal(updated.segments[0].route.mode, 'transit');
  assert.equal(updated.segments[0].route.signature, current.route.signature);
});

test('un cambio efectivo de modo invalida la ruta anterior', () => {
  const state = stateWithRoute();
  const current = state.segments[0];
  const updated = tripReducer(state, {
    type: TRIP_ACTIONS.updateExpenses,
    segmentId: 'segment-1',
    expenses: {
      ...current.expenses,
      transport: { plane: 0, train: 0, bus: 0, taxiUber: 300 },
    },
  });

  assert.equal(updated.segments[0].route, null);
});

test('una respuesta tardía no se guarda sobre una firma nueva', () => {
  const state = stateWithRoute();
  const changed = update(state, {
    destination: { ...state.segments[0].destination, lat: 51 },
  });
  const staleResponse = update(changed, { route: state.segments[0].route });

  assert.equal(staleResponse.segments[0].route, null);
});
