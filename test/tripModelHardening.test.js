import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_LIMITS,
  appendSegment,
  createCity,
  createSegment,
  normalizeTrip,
  reorderSegments,
  routeStops,
} from '../src/modules/trips/tripModel.js';

test('normaliza códigos de país, coordenadas, fechas y moneda', () => {
  assert.equal(createCity({ countryCode: 'mx' }).countryCode, 'MX');
  assert.equal(createCity({ countryCode: 'M1' }).countryCode, '');
  assert.equal(createCity({ lat: 91, lon: -181 }).lat, null);
  assert.equal(createCity({ lat: 91, lon: -181 }).lon, null);

  const segment = createSegment({ startDate: '2026-02-29', endDate: '2026-12-01' });
  assert.equal(segment.startDate, '');
  assert.equal(segment.endDate, '2026-12-01');

  assert.equal(normalizeTrip({ currency: 'eur' }).currency, 'EUR');
  assert.equal(normalizeTrip({ currency: 'EURO' }).currency, 'USD');
});

test('limita texto y colecciones provenientes de datos manipulados', () => {
  const raw = {
    name: 'x'.repeat(TRIP_LIMITS.tripName + 20),
    segments: Array.from({ length: TRIP_LIMITS.segments + 5 }, (_, index) => ({
      id: `segment-${index}`,
      note: 'n'.repeat(TRIP_LIMITS.segmentNote + 20),
    })),
    notes: Array.from({ length: TRIP_LIMITS.notes + 5 }, (_, index) => ({
      id: `note-${index}`,
      title: 't'.repeat(TRIP_LIMITS.noteTitle + 20),
      text: 'x'.repeat(TRIP_LIMITS.noteText + 20),
    })),
    checklist: Array.from({ length: TRIP_LIMITS.checklist + 5 }, (_, index) => ({
      id: `item-${index}`,
      text: 'c'.repeat(TRIP_LIMITS.checklistText + 20),
    })),
  };

  const trip = normalizeTrip(raw);
  assert.equal(trip.name.length, TRIP_LIMITS.tripName);
  assert.equal(trip.segments.length, TRIP_LIMITS.segments);
  assert.equal(trip.segments[0].note.length, TRIP_LIMITS.segmentNote);
  assert.equal(trip.notes.length, TRIP_LIMITS.notes);
  assert.equal(trip.notes[0].title.length, TRIP_LIMITS.noteTitle);
  assert.equal(trip.notes[0].text.length, TRIP_LIMITS.noteText);
  assert.equal(trip.checklist.length, TRIP_LIMITS.checklist);
  assert.equal(trip.checklist[0].text.length, TRIP_LIMITS.checklistText);
});

test('no agrega segmentos por encima del límite', () => {
  const trip = {
    id: 'trip',
    segments: Array.from({ length: TRIP_LIMITS.segments }, (_, index) => ({ id: String(index) })),
  };
  assert.equal(appendSegment(trip), trip);
});

test('reordena el tramo completo y actualiza el orden usado por la ruta', () => {
  const trip = normalizeTrip({
    id: 'trip',
    segments: [
      {
        id: 'a',
        origin: { name: 'A', lat: 1, lon: 1 },
        destination: { name: 'B', lat: 2, lon: 2 },
        note: 'nota a',
        expenses: { lodging: 10 },
      },
      {
        id: 'b',
        origin: { name: 'C', lat: 3, lon: 3 },
        destination: { name: 'D', lat: 4, lon: 4 },
        note: 'nota b',
        expenses: { lodging: 20 },
      },
      {
        id: 'c',
        origin: { name: 'E', lat: 5, lon: 5 },
        destination: { name: 'F', lat: 6, lon: 6 },
        note: 'nota c',
        expenses: { lodging: 30 },
      },
    ],
  });

  const reordered = reorderSegments(trip, 'c', 'a', 'before');
  assert.deepEqual(
    reordered.segments.map((segment) => segment.id),
    ['c', 'a', 'b']
  );
  assert.equal(reordered.segments[0].note, 'nota c');
  assert.equal(reordered.segments[0].expenses.lodging, 30);
  assert.deepEqual(
    routeStops(reordered.segments).map((city) => city.name),
    ['E', 'F', 'A', 'B', 'C', 'D']
  );
});
