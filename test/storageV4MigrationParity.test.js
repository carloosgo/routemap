import test from 'node:test';
import assert from 'node:assert/strict';
import { createTripRevisionPayload } from '../src/infrastructure/firebase/tripStorageSchema.js';
import { materializeV3TripToV4 } from '../src/modules/storage-v4/v3MigrationMaterializer.js';
import { materializePersistedV3ToV4 } from '../functions/v4MigrationMaterializer.js';

function expenses(lodging) {
  return {
    lodging,
    food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
    transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    transportOthers: [], attractions: [], others: [],
  };
}

function fixture() {
  return {
    id: 'trip-parity-2026',
    name: 'Parity',
    currency: 'EUR',
    placeOrderVersion: 1,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-08-10T20:00:00.000Z',
    segments: [{
      id: 'segment-a',
      origin: { id: 'a', name: 'A', displayName: 'A', country: 'España', countryCode: 'ES', lat: 40, lon: -3 },
      destination: { id: 'b', name: 'B', displayName: 'B', country: 'Francia', countryCode: 'FR', lat: 48, lon: 2 },
      startDate: '2026-12-01', endDate: '2026-12-02', expenses: expenses(123), note: 'nota',
    }],
    places: [
      {
        id: 'google-1', provider: 'google', googlePlaceId: 'ChIJ-stable', userLabel: 'Favorito',
        name: 'dynamic', address: 'dynamic', city: 'Madrid', country: 'España', category: 'museum',
        countryCode: 'ES', lat: 40.4, lon: -3.7, savedAt: '2026-05-01T10:00:00.000Z',
      },
      {
        id: 'geo-1', provider: 'geoapify', googlePlaceId: '', userLabel: '', name: 'Geo', address: 'Addr',
        city: 'Paris', country: 'France', category: 'tourism', countryCode: 'FR', lat: 48.8, lon: 2.3,
        savedAt: '2026-05-02T10:00:00.000Z',
      },
    ],
    routeConnections: [{
      id: 'connection-1', fromPlaceId: 'google-1', toPlaceId: 'geo-1', provider: 'google',
      mode: 'train', visible: true, distance: 1, duration: 2,
      geometry: { type: 'LineString', coordinates: [[-3.7, 40.4], [2.3, 48.8]] },
      calculatedAt: '2026-08-01T00:00:00.000Z', transitSteps: [{ lineName: 'dynamic' }],
    }],
    notes: [{ id: 'note-1', title: 'Title', text: 'Body' }],
    checklist: [{ id: 'check-1', text: 'Passport', done: true }],
  };
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value.toMillis === 'function') return { timestampMs: value.toMillis() };
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

const timestampFromIso = (iso) => ({ timestampMs: new Date(iso).getTime() });

test('materializador backend produce exactamente el mismo estado canónico v4 que el materializador cliente', () => {
  const rawTrip = fixture();
  const persisted = createTripRevisionPayload(rawTrip, 'revision_parity_01', rawTrip.updatedAt);
  const server = materializePersistedV3ToV4({
    summary: persisted.summary,
    revision: { ...persisted.revision, complete: true },
    collections: persisted.collections,
  });
  const client = materializeV3TripToV4(rawTrip, { timestampFromIso });

  assert.deepEqual(normalize(server.root), normalize(client.root));
  assert.deepEqual(normalize(server.collections), normalize(client.collections));
  assert.equal(server.source.tripId, client.source.tripId);
  assert.equal(server.source.sourceUpdatedAt, client.source.updatedAt);

  assert.equal(server.contributions.length, 3);
  const segmentContribution = server.contributions.find((item) => item.entityId === 'segment-a');
  assert.equal(segmentContribution.version, 1);
  assert.equal(segmentContribution.countContribution, 1);
  assert.equal(segmentContribution.valueContribution, 123);
});

test('materializador backend falla cerrado ante counts o total v3 inconsistentes', () => {
  const rawTrip = fixture();
  const persisted = createTripRevisionPayload(rawTrip, 'revision_parity_02', rawTrip.updatedAt);
  const input = {
    summary: { ...persisted.summary, total: persisted.summary.total + 1 },
    revision: { ...persisted.revision, complete: true },
    collections: persisted.collections,
  };
  assert.throws(() => materializePersistedV3ToV4(input), /total v3 declarado/);

  const badCount = {
    ...input,
    summary: { ...persisted.summary, segmentCount: 2 },
  };
  assert.throws(() => materializePersistedV3ToV4(badCount), /segmentCount v3 no coincide/);
});
