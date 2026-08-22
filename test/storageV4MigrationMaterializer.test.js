import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeV3TripToV4 } from '../src/modules/storage-v4/v3MigrationMaterializer.js';
import { verifyV3ToV4Materialization } from '../src/modules/storage-v4/v3MigrationVerifier.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';

function expenses(lodging) {
  return {
    lodging,
    food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
    transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    transportOthers: [],
    attractions: [],
    others: [],
  };
}

function fixtureTrip() {
  return {
    id: 'trip-europe-2026',
    name: 'Europa 2026',
    currency: 'EUR',
    placeOrderVersion: 1,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-08-10T20:00:00.000Z',
    segments: [
      {
        id: 'segment-madrid-paris',
        origin: { id: 'madrid', name: 'Madrid', displayName: 'Madrid', country: 'España', countryCode: 'ES', lat: 40.4168, lon: -3.7038 },
        destination: { id: 'paris', name: 'París', displayName: 'París', country: 'Francia', countryCode: 'FR', lat: 48.8566, lon: 2.3522 },
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        expenses: expenses(200),
        note: 'Tren por la mañana',
      },
      {
        id: 'segment-paris-berlin',
        origin: { id: 'paris', name: 'París', displayName: 'París', country: 'Francia', countryCode: 'FR', lat: 48.8566, lon: 2.3522 },
        destination: { id: 'berlin', name: 'Berlín', displayName: 'Berlín', country: 'Alemania', countryCode: 'DE', lat: 52.52, lon: 13.405 },
        startDate: '2026-12-03',
        endDate: '2026-12-05',
        expenses: expenses(300),
        note: '',
      },
    ],
    places: [
      {
        id: 'google-place-1',
        provider: 'google',
        googlePlaceId: 'ChIJ-google-stable',
        userLabel: 'Museo favorito',
        name: 'Nombre dinámico Google',
        address: 'Dirección dinámica',
        city: 'Madrid',
        country: 'España',
        category: 'museum',
        countryCode: 'ES',
        lat: 40.4,
        lon: -3.7,
        savedAt: '2026-05-01T10:00:00.000Z',
      },
      {
        id: 'geo-place-1',
        provider: 'geoapify',
        googlePlaceId: '',
        userLabel: '',
        name: 'Puerta de Brandeburgo',
        address: 'Pariser Platz',
        city: 'Berlín',
        country: 'Alemania',
        category: 'tourism',
        countryCode: 'DE',
        lat: 52.5163,
        lon: 13.3777,
        savedAt: '2026-05-02T10:00:00.000Z',
      },
    ],
    routeConnections: [
      {
        id: 'route-google-geo',
        fromPlaceId: 'google-place-1',
        toPlaceId: 'geo-place-1',
        provider: 'google',
        mode: 'train',
        visible: true,
        distance: 999999,
        duration: 99999,
        geometry: { type: 'LineString', coordinates: [[-3.7, 40.4], [13.37, 52.51]] },
        calculatedAt: '2026-08-01T00:00:00.000Z',
        transitSteps: [{ lineName: 'dynamic' }],
      },
    ],
    notes: [
      { id: 'note-1', title: 'Reservas', text: 'Confirmar hotel' },
    ],
    checklist: [
      { id: 'check-1', text: 'Pasaporte', done: true },
      { id: 'check-2', text: 'Seguro', done: false },
    ],
  };
}

const timestampFromIso = (iso) => ({ type: 'timestamp', iso });

test('materialización v3→v4 es determinista y conserva IDs, orden, agregados y fechas', () => {
  const source = fixtureTrip();
  const first = materializeV3TripToV4(source, { timestampFromIso });
  const second = materializeV3TripToV4(source, { timestampFromIso });

  assert.deepEqual(first, second);
  assert.equal(first.root.id, source.id);
  assert.equal(first.root.schemaVersion, 4);
  assert.equal(first.root.version, 1);
  assert.equal(first.root.segmentCount, 2);
  assert.equal(first.root.placeCount, 2);
  assert.equal(first.root.total, 500);
  assert.deepEqual(first.root.createdAt, timestampFromIso(source.createdAt));
  assert.deepEqual(first.root.updatedAt, timestampFromIso(source.updatedAt));

  assert.deepEqual(first.collections.segments.map((item) => item.id), [
    'segment-madrid-paris',
    'segment-paris-berlin',
  ]);
  assert.deepEqual(first.collections.segments.map((item) => item.rank), [
    initialRankForPosition(0),
    initialRankForPosition(1),
  ]);
  assert.equal(first.collections.connections[0].id, 'route-google-geo');
  assert.equal(first.collections.connections[0].fromPlaceId, 'google-place-1');
  assert.equal(first.collections.connections[0].toPlaceId, 'geo-place-1');
});

test('Google Places migra solo referencia estable + etiqueta y conexiones no copian payload dinámico', () => {
  const result = materializeV3TripToV4(fixtureTrip(), { timestampFromIso });
  const google = result.collections.places[0];
  assert.equal(google.provider, 'google');
  assert.equal(google.googlePlaceId, 'ChIJ-google-stable');
  assert.equal(google.userLabel, 'Museo favorito');
  assert.equal(google.name, '');
  assert.equal(google.address, '');
  assert.equal(google.city, '');
  assert.equal(google.country, '');
  assert.equal(google.category, '');
  assert.equal(google.countryCode, '');
  assert.equal(google.lat, null);
  assert.equal(google.lon, null);

  const connection = result.collections.connections[0];
  assert.deepEqual(Object.keys(connection).sort(), [
    'createdAt', 'deletedAt', 'fromPlaceId', 'id', 'mode', 'rank',
    'status', 'toPlaceId', 'updatedAt', 'version', 'visible',
  ]);
  assert.equal('geometry' in connection, false);
  assert.equal('distance' in connection, false);
  assert.equal('duration' in connection, false);
  assert.equal('transitSteps' in connection, false);
  assert.equal('provider' in connection, false);
});

test('verificador independiente acepta snapshot íntegro y reporta paridad completa', () => {
  const source = fixtureTrip();
  const snapshot = materializeV3TripToV4(source, { timestampFromIso });
  const verification = verifyV3ToV4Materialization(source, snapshot);

  assert.equal(verification.ok, true);
  assert.deepEqual(verification.issues, []);
  assert.deepEqual(verification.expected, {
    tripId: 'trip-europe-2026',
    segmentCount: 2,
    placeCount: 2,
    connectionCount: 1,
    noteCount: 1,
    checklistCount: 2,
    total: 500,
  });
});

test('verificador detecta rank, total, contenido y referencias corruptas', () => {
  const source = fixtureTrip();
  const snapshot = materializeV3TripToV4(source, { timestampFromIso });
  snapshot.root.total = 999;
  snapshot.collections.segments[0].rank = initialRankForPosition(4);
  snapshot.collections.notes[0].text = 'alterado';
  snapshot.collections.connections[0].toPlaceId = 'missing-place';

  const verification = verifyV3ToV4Materialization(source, snapshot);
  const codes = new Set(verification.issues.map((item) => item.code));
  assert.equal(verification.ok, false);
  assert.equal(codes.has('root-total'), true);
  assert.equal(codes.has('entity-rank'), true);
  assert.equal(codes.has('entity-content'), true);
  assert.equal(codes.has('connection-reference'), true);
});

test('migración rechaza origen sin IDs estables antes de que normalizeTrip pueda inventarlos', () => {
  const source = fixtureTrip();
  delete source.segments[0].id;
  assert.throws(
    () => materializeV3TripToV4(source, { timestampFromIso }),
    /segments requiere id estable/
  );

  const sourceWithMissingTripId = fixtureTrip();
  delete sourceWithMissingTripId.id;
  assert.throws(
    () => materializeV3TripToV4(sourceWithMissingTripId, { timestampFromIso }),
    /trip requiere id estable/
  );
});
