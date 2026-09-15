import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMultilineText, sanitizeText } from '../src/shared/utils.js';
import { normalizeTrip } from '../src/modules/trips/tripEntities.js';
import { TRIP_ACTIONS, tripReducer } from '../src/modules/trips/tripReducer.js';

test('sanitizador multilínea conserva Enter y elimina otros caracteres de control', () => {
  assert.equal(sanitizeText('uno\ndos'), 'unodos');
  assert.equal(
    sanitizeMultilineText('uno\r\ndos\rtres\u0000\tcuatro'),
    'uno\ndos\ntrescuatro'
  );
});

test('normalización v4 conserva saltos de línea en todos los tipos de nota', () => {
  const trip = normalizeTrip({
    id: 'trip-1',
    name: 'Viaje',
    currency: 'USD',
    originDetails: { note: 'origen 1\r\norigen 2' },
    segments: [{ id: 'segment-1', note: 'trayecto 1\rtrayecto 2' }],
    places: [{
      id: 'place-1',
      provider: 'google',
      googlePlaceId: 'place-1',
      userLabel: 'Lugar',
      segmentId: 'segment-1',
      dayOffset: 0,
      note: 'lugar 1\nlugar 2',
    }],
    placeOrderVersion: 1,
    notes: [{ id: 'note-1', title: 'Plan', text: 'general 1\r\ngeneral 2' }],
    checklist: [],
  });

  assert.equal(trip.originDetails.note, 'origen 1\norigen 2');
  assert.equal(trip.segments[0].note, 'trayecto 1\ntrayecto 2');
  assert.equal(trip.places[0].note, 'lugar 1\nlugar 2');
  assert.equal(trip.notes[0].text, 'general 1\ngeneral 2');
});

test('edición en reducer conserva Enter en notas de trayecto, lugar, origen y Notas', () => {
  const state = normalizeTrip({
    id: 'trip-1',
    name: 'Viaje',
    currency: 'USD',
    originDetails: { note: '' },
    segments: [{ id: 'segment-1', note: '' }],
    places: [{
      id: 'place-1',
      provider: 'google',
      googlePlaceId: 'place-1',
      userLabel: 'Lugar',
      segmentId: 'segment-1',
      dayOffset: 0,
      note: '',
    }],
    placeOrderVersion: 1,
    notes: [{ id: 'note-1', title: '', text: '' }],
    checklist: [],
  });

  const withSegmentNote = tripReducer(state, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'segment-1',
    patch: { note: 'línea 1\nlínea 2' },
  });
  assert.equal(withSegmentNote.segments[0].note, 'línea 1\nlínea 2');

  const withPlaceNote = tripReducer(withSegmentNote, {
    type: TRIP_ACTIONS.updatePlace,
    placeId: 'place-1',
    patch: { note: 'lugar 1\nlugar 2' },
  });
  assert.equal(withPlaceNote.places[0].note, 'lugar 1\nlugar 2');

  const withOriginNote = tripReducer(withPlaceNote, {
    type: TRIP_ACTIONS.updateOriginDetails,
    patch: { note: 'origen 1\norigen 2' },
  });
  assert.equal(withOriginNote.originDetails.note, 'origen 1\norigen 2');

  const withGeneralNote = tripReducer(withOriginNote, {
    type: TRIP_ACTIONS.updateNote,
    id: 'note-1',
    field: 'text',
    value: 'general 1\ngeneral 2',
  });
  assert.equal(withGeneralNote.notes[0].text, 'general 1\ngeneral 2');
});
