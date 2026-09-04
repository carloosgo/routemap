import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIP_ACTIONS,
  createInitialTrip,
  tripReducer,
} from '../src/modules/trips/tripReducer.js';
import {
  TRIP_LIMITS,
  createSegment,
  createTrip,
  routeStops,
} from '../src/modules/trips/tripModel.js';

const reduce = (state, type, values = {}) =>
  tripReducer(state, { type, ...values });

function baseTrip() {
  return {
    ...createTrip('Europa'),
    id: 'trip-1',
    segments: [
      createSegment({ id: 'segment-1' }),
      createSegment({ id: 'segment-2' }),
    ],
    places: [],
    notes: [{ id: 'note-1', title: 'Nota', text: 'Texto' }],
    checklist: [{ id: 'item-1', text: 'Pasaporte', done: false }],
  };
}

test('el estado inicial crea un viaje editable y normaliza viajes existentes', () => {
  const fresh = createInitialTrip();
  const loaded = createInitialTrip({
    id: 'existing-trip',
    name: '  Ruta existente  ',
    currency: 'mxn',
    segments: [{ id: 'existing-segment' }],
  });

  assert.equal(fresh.segments.length, 1);
  assert.equal(loaded.id, 'existing-trip');
  assert.equal(loaded.name, '  Ruta existente  ');
  assert.equal(loaded.currency, 'MXN');
  assert.equal(loaded.segments[0].id, 'existing-segment');
});

test('renombrar, cambiar moneda y cargar conservan el contrato del viaje', () => {
  const renamed = reduce(baseTrip(), TRIP_ACTIONS.rename, {
    name: '  Nuevo nombre  ',
  });
  const currency = reduce(renamed, TRIP_ACTIONS.setCurrency, {
    currency: 'EUR',
  });
  const loaded = reduce(currency, TRIP_ACTIONS.load, {
    trip: { id: 'loaded', name: 'Cargado', segments: [] },
  });

  assert.equal(renamed.name, '  Nuevo nombre  ');
  assert.equal(currency.currency, 'EUR');
  assert.equal(loaded.id, 'loaded');
  assert.equal(loaded.name, 'Cargado');
});

test('notas y checklist se agregan, actualizan, alternan y eliminan', () => {
  const withNote = reduce(baseTrip(), TRIP_ACTIONS.addNote);
  const updatedNote = reduce(withNote, TRIP_ACTIONS.updateNote, {
    id: 'note-1',
    field: 'text',
    value: 'Texto actualizado',
  });
  const withoutNote = reduce(updatedNote, TRIP_ACTIONS.removeNote, {
    id: 'note-1',
  });
  const withItem = reduce(withoutNote, TRIP_ACTIONS.addChecklistItem, {
    text: 'Seguro de viaje',
  });
  const toggled = reduce(withItem, TRIP_ACTIONS.toggleChecklistItem, {
    id: 'item-1',
  });
  const withoutItem = reduce(toggled, TRIP_ACTIONS.removeChecklistItem, {
    id: 'item-1',
  });

  assert.equal(withNote.notes.at(-1).title, '');
  assert.equal(updatedNote.notes[0].text, 'Texto actualizado');
  assert.equal(withoutNote.notes.some(({ id }) => id === 'note-1'), false);
  assert.equal(withItem.checklist.at(-1).text, 'Seguro de viaje');
  assert.equal(toggled.checklist[0].done, true);
  assert.equal(withoutItem.checklist.some(({ id }) => id === 'item-1'), false);
});

test('segmentos se agregan, editan, reordenan y eliminan completos', () => {
  const added = reduce(baseTrip(), TRIP_ACTIONS.addSegment);
  const updated = reduce(added, TRIP_ACTIONS.updateSegment, {
    segmentId: 'segment-1',
    patch: { note: 'Tren nocturno' },
  });
  const expenses = { transport: { train: 120 } };
  const withExpenses = reduce(updated, TRIP_ACTIONS.updateExpenses, {
    segmentId: 'segment-1',
    expenses,
  });
  const reordered = reduce(withExpenses, TRIP_ACTIONS.reorderSegment, {
    sourceId: 'segment-2',
    targetId: 'segment-1',
    placement: 'before',
  });
  const removed = reduce(reordered, TRIP_ACTIONS.removeSegment, {
    segmentId: 'segment-1',
  });

  assert.equal(added.segments.length, 3);
  assert.equal(updated.segments[0].note, 'Tren nocturno');
  assert.equal(withExpenses.segments[0].expenses, expenses);
  assert.equal(reordered.segments[0].id, 'segment-2');
  assert.equal(removed.segments.some(({ id }) => id === 'segment-1'), false);
});

test('borrar el ultimo trayecto conserva el origen, pero limpiar origen es una accion explicita independiente', () => {
  const origin = {
    id: 'frankfurt',
    name: 'Frankfurt',
    displayName: 'Frankfurt, Germany',
    country: 'Germany',
    countryCode: 'DE',
    lat: 50.1109,
    lon: 8.6821,
  };
  const destination = {
    id: 'nuremberg',
    name: 'Nuremberg',
    displayName: 'Nuremberg, Germany',
    country: 'Germany',
    countryCode: 'DE',
    lat: 49.4521,
    lon: 11.0767,
  };
  const munich = {
    id: 'munich',
    name: 'Munich',
    displayName: 'Munich, Germany',
    country: 'Germany',
    countryCode: 'DE',
    lat: 48.1351,
    lon: 11.582,
  };
  const onlySegment = createSegment({
    id: 'only-segment',
    destination,
    startDate: '2026-09-07',
    endDate: '2026-09-09',
    note: 'Eliminar junto con el trayecto',
  });
  const state = {
    ...createTrip('Alemania'),
    origin,
    segments: [onlySegment],
  };

  const removed = reduce(state, TRIP_ACTIONS.removeSegment, {
    segmentId: onlySegment.id,
  });
  const retainedSegment = removed.segments[0];

  assert.equal(removed.segments.length, 1);
  assert.notEqual(retainedSegment.id, onlySegment.id);
  assert.deepEqual(removed.origin, origin);
  assert.equal(Object.hasOwn(retainedSegment, 'origin'), false);
  assert.equal(retainedSegment.destination, null);
  assert.equal(retainedSegment.startDate, '');
  assert.equal(retainedSegment.endDate, '');
  assert.equal(retainedSegment.note, '');

  const cleared = reduce(removed, TRIP_ACTIONS.updateOrigin, {
    origin: null,
  });
  assert.equal(cleared.origin, null);

  const replacementOrigin = { ...origin, id: 'munich-origin', name: 'Munich' };
  const replaced = reduce(cleared, TRIP_ACTIONS.updateOrigin, {
    origin: replacementOrigin,
  });
  assert.equal(replaced.origin.name, 'Munich');

  const routedState = {
    ...createTrip('Ruta alemana'),
    origin,
    segments: [
      createSegment({ id: 'leg-1', destination }),
      createSegment({ id: 'leg-2', destination: munich }),
    ],
  };
  const ignoredLegacyPatch = reduce(routedState, TRIP_ACTIONS.updateSegment, {
    segmentId: 'leg-1',
    patch: { origin: null },
  });

  assert.deepEqual(ignoredLegacyPatch.origin, origin);
  assert.equal(Object.hasOwn(ignoredLegacyPatch.segments[0], 'origin'), false);
  assert.deepEqual(
    routeStops(ignoredLegacyPatch).map((city) => city.name),
    ['Frankfurt', 'Nuremberg', 'Munich']
  );

  const withoutExplicitOrigin = reduce(routedState, TRIP_ACTIONS.updateOrigin, {
    origin: null,
  });
  assert.deepEqual(
    routeStops(withoutExplicitOrigin).map((city) => city.name),
    ['Nuremberg', 'Munich']
  );
});

test('lugares se normalizan, no se duplican y respetan el límite del viaje', () => {
  const state = baseTrip();
  const place = { id: 'place-1', name: 'Museo', lat: '48.8606', lon: '2.3376' };
  const added = reduce(state, TRIP_ACTIONS.addPlace, { place });
  const duplicate = reduce(added, TRIP_ACTIONS.addPlace, { place });
  const full = {
    ...state,
    places: Array.from({ length: TRIP_LIMITS.places }, (_, index) => ({
      id: `place-${index}`,
    })),
  };
  const rejected = reduce(full, TRIP_ACTIONS.addPlace, {
    place: { ...place, id: 'overflow' },
  });
  const removed = reduce(added, TRIP_ACTIONS.removePlace, {
    placeId: 'place-1',
  });

  assert.equal(added.places[0].lat, 48.8606);
  assert.equal(added.places[0].lon, 2.3376);
  assert.equal(duplicate, added);
  assert.equal(rejected, full);
  assert.equal(removed.places.length, 0);
});

test('reset crea otro viaje editable y acciones desconocidas no mutan el estado', () => {
  const state = baseTrip();
  const reset = reduce(state, TRIP_ACTIONS.reset);
  const unchanged = tripReducer(state, { type: 'UNKNOWN_ACTION' });

  assert.notEqual(reset.id, state.id);
  assert.equal(reset.segments.length, 1);
  assert.equal(unchanged, state);
});
