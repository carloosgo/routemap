import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORED_TRIP_KIND, storedTripKind } from '../src/infrastructure/firebase/tripStorageKind.js';
import { hydrateV4Trip, v4TripListEntry } from '../src/infrastructure/firebase/v4TripHydration.js';

function timestamp(iso) {
  const millis = new Date(iso).getTime();
  return { toMillis: () => millis, toDate: () => new Date(millis) };
}

test('clasificador distingue v3, v4, legacy y desconocido sin heurística ambigua', () => {
  assert.equal(storedTripKind({ schemaVersion: 4 }), STORED_TRIP_KIND.V4);
  assert.equal(storedTripKind({
    storageVersion: 3,
    activeRevision: 'revision_1234',
  }), STORED_TRIP_KIND.V3);
  assert.equal(storedTripKind({ id: 'legacy', name: 'Legacy' }), STORED_TRIP_KIND.LEGACY);
  assert.equal(storedTripKind({ marker: true }), STORED_TRIP_KIND.UNKNOWN);
  assert.equal(storedTripKind(null), STORED_TRIP_KIND.UNKNOWN);
});

test('hidratación v4 excluye tombstones y reconstruye el modelo actual de viaje', () => {
  const createdAt = timestamp('2026-01-01T00:00:00.000Z');
  const updatedAt = timestamp('2026-08-10T20:00:00.000Z');
  const trip = hydrateV4Trip({
    id: 'trip-v4',
    name: 'Europa',
    currency: 'EUR',
    schemaVersion: 4,
    createdAt,
    updatedAt,
  }, {
    segments: [
      { id: 'segment-1', status: 'active', origin: null, destination: null, startDate: '', endDate: '', expenses: { lodging: 0, food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 }, transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 }, transportOthers: [], attractions: [], others: [] }, note: '' },
      { id: 'segment-deleted', status: 'deleted' },
    ],
    places: [],
    connections: [],
    notes: [{ id: 'note-1', status: 'active', title: 'Reserva', text: 'Hotel' }],
    checklist: [{ id: 'check-deleted', status: 'deleted', text: 'No visible', done: false }],
  });

  assert.equal(trip.id, 'trip-v4');
  assert.equal(trip.name, 'Europa');
  assert.equal(trip.currency, 'EUR');
  assert.deepEqual(trip.segments.map((item) => item.id), ['segment-1']);
  assert.deepEqual(trip.notes.map((item) => item.id), ['note-1']);
  assert.deepEqual(trip.checklist, []);
  assert.equal(trip.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(trip.updatedAt, '2026-08-10T20:00:00.000Z');
});

test('list entry v4 normaliza timestamps y conserva solo resumen barato', () => {
  const entry = v4TripListEntry('trip-v4', {
    name: 'Europa', currency: 'EUR', schemaVersion: 4, status: 'active', version: 3,
    createdAt: timestamp('2026-01-01T00:00:00.000Z'),
    updatedAt: timestamp('2026-08-10T20:00:00.000Z'),
    segmentCount: 12, placeCount: 30, total: 1234,
  });
  assert.deepEqual(entry, {
    id: 'trip-v4', name: 'Europa', currency: 'EUR', schemaVersion: 4,
    status: 'active', version: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-10T20:00:00.000Z',
    segmentCount: 12, placeCount: 30, total: 1234,
  });
});

test('Gate G sigue desactivado: selector productivo no importa ni crea el repositorio híbrido', async () => {
  const source = await readFile('src/modules/trips/tripRepositorySelector.js', 'utf8');
  assert.doesNotMatch(source, /firestoreHybridTripRepository/);
  assert.doesNotMatch(source, /createFirestoreHybridTripRepository/);
  assert.match(source, /createFirestoreTripRepository/);
});
