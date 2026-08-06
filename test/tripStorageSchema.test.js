import test from 'node:test';
import assert from 'node:assert/strict';

import { createSegment, createTrip } from '../src/modules/trips/tripModel.js';
import {
  TRIP_STORAGE_VERSION,
  createTripRevisionPayload,
  createVersionedTripListEntry,
  hydrateVersionedTrip,
  isVersionedTripSummary,
} from '../src/infrastructure/firebase/tripStorageSchema.js';

function sampleTrip() {
  const trip = createTrip('Europa');
  return {
    ...trip,
    id: 'trip-europe',
    currency: 'EUR',
    segments: [
      createSegment({
        id: 'segment-1',
        origin: { name: 'París', lat: 48.8566, lon: 2.3522 },
        destination: { name: 'Bruselas', lat: 50.8503, lon: 4.3517 },
      }),
    ],
    places: [{
      id: 'place-1',
      name: 'Louvre',
      address: '',
      city: 'París',
      country: 'Francia',
      category: 'museum',
      countryCode: 'FR',
      lat: 48.8606,
      lon: 2.3376,
      savedAt: '2026-08-05T00:00:00.000Z',
    }],
    notes: [{ id: 'note-1', title: 'Reserva', text: 'Confirmada' }],
    checklist: [{ id: 'item-1', text: 'Pasaporte', done: true }],
  };
}

test('el documento principal contiene solo metadatos y conteos', () => {
  const payload = createTripRevisionPayload(
    sampleTrip(),
    'revision0001',
    '2026-08-05T00:00:00.000Z'
  );

  assert.equal(payload.summary.storageVersion, TRIP_STORAGE_VERSION);
  assert.equal(payload.summary.activeRevision, 'revision0001');
  assert.equal(payload.summary.segmentCount, 1);
  assert.equal(payload.summary.placeCount, 1);
  assert.equal(payload.summary.noteCount, 1);
  assert.equal(payload.summary.checklistCount, 1);
  assert.equal(Object.hasOwn(payload.summary, 'segments'), false);
  assert.equal(Object.hasOwn(payload.summary, 'places'), false);
  assert.equal(Object.hasOwn(payload.summary, 'notes'), false);
  assert.equal(Object.hasOwn(payload.summary, 'checklist'), false);
});

test('cada colección conserva posición y el tramo no duplica lugares', () => {
  const payload = createTripRevisionPayload(sampleTrip(), 'revision0002');

  assert.equal(payload.collections.segments[0].position, 0);
  assert.equal(Object.hasOwn(payload.collections.segments[0], 'places'), false);
  assert.equal(payload.collections.places[0].position, 0);
  assert.equal(payload.collections.notes[0].position, 0);
  assert.equal(payload.collections.checklist[0].position, 0);
});

test('hidratar una revisión restaura el viaje completo y su orden', () => {
  const payload = createTripRevisionPayload(sampleTrip(), 'revision0003');
  const shuffled = {
    ...payload.collections,
    segments: [...payload.collections.segments].reverse(),
    places: [...payload.collections.places].reverse(),
  };
  const hydrated = hydrateVersionedTrip(payload.summary, shuffled);

  assert.equal(hydrated.id, 'trip-europe');
  assert.equal(hydrated.segments[0].id, 'segment-1');
  assert.equal(hydrated.places[0].id, 'place-1');
  assert.equal(hydrated.notes[0].id, 'note-1');
  assert.equal(hydrated.checklist[0].id, 'item-1');
});

test('la lista usa resúmenes ligeros sin hidratar el contenido', () => {
  const payload = createTripRevisionPayload(sampleTrip(), 'revision0004');
  const entry = createVersionedTripListEntry(payload.summary.id, payload.summary);

  assert.equal(isVersionedTripSummary(entry), true);
  assert.equal(entry.segmentCount, 1);
  assert.equal(entry.placeCount, 1);
  assert.equal(Object.hasOwn(entry, 'segments'), false);
});

test('se rechazan identificadores de revisión inseguros', () => {
  assert.throws(
    () => createTripRevisionPayload(sampleTrip(), '../revision'),
    /identificador de revisión válido/
  );
});
