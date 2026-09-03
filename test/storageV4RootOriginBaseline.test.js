import test from 'node:test';
import assert from 'node:assert/strict';
import { v4EntityKey } from '../src/modules/storage-v4/entityKeyModel.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createFirestoreV4EditorTripWriter } from '../src/infrastructure/firebase/firestoreV4EditorTripWriter.js';
import { createFirestoreV4PilotTripWriter } from '../src/infrastructure/firebase/firestoreV4PilotTripWriter.js';

const TRIP_ID = 'trip-origin-baseline';
const ORIGIN = Object.freeze({
  id: 'city-mexico-city',
  name: 'Ciudad de México',
  displayName: 'Ciudad de México, México',
  country: 'México',
  countryCode: 'MX',
  lat: 19.4326,
  lon: -99.1332,
});

function remoteRoot() {
  return {
    id: TRIP_ID,
    name: 'Europa',
    currency: 'EUR',
    origin: ORIGIN,
    originDetails: null,
    schemaVersion: 4,
    status: 'active',
    version: 3,
  };
}

function emptyRemoteCollections() {
  return {
    segments: [],
    places: [],
    routeConnections: [],
    notes: [],
    checklist: [],
  };
}

function rootKey() {
  return v4EntityKey({
    userId: 'alice',
    tripId: TRIP_ID,
    entityType: 'trip',
    entityId: TRIP_ID,
  });
}

test('editor v4 conserva trip.origin estructurado al primar el baseline remoto', async () => {
  const localPersistence = createMemoryV4LocalPersistence();
  const composition = {
    localPersistence,
    runtime: {},
    async stop() {},
  };
  const baseWriterFactory = () => ({
    async acceptRemoteState() { return { clearedConflicts: 0 }; },
    async save() {},
    async remove() {},
    async recoverPending() { return 0; },
    async close() {},
  });
  const writer = createFirestoreV4EditorTripWriter({
    db: {},
    uid: 'alice',
    telemetryEnabled: false,
    repository: {},
    composition,
    baseWriterFactory,
  });

  await writer.acceptRemoteState({
    tripId: TRIP_ID,
    remoteRoot: remoteRoot(),
    remoteCollections: emptyRemoteCollections(),
  });

  const baseline = await localPersistence.getEntity(rootKey());
  assert.deepEqual(baseline.payload.origin, ORIGIN);
  assert.equal(baseline.serverVersion, 3);
  assert.equal(baseline.serverStatus, 'active');
  await writer.close();
});

test('writer v4 conserva trip.origin estructurado al rebasar el baseline antes de guardar', async () => {
  const localPersistence = createMemoryV4LocalPersistence();
  const committed = [];
  const composition = {
    localPersistence,
    syncCoordinator: {
      async flush() {
        throw new Error('No debe hacer flush sin mutaciones pendientes.');
      },
    },
    runtime: {
      async commitIntent(intent) { committed.push(intent); },
      async recoverPending() { return 0; },
    },
    async stop() {},
  };
  const repository = {
    async getTripSummary() { return remoteRoot(); },
    async listEntities() { return []; },
  };
  const writer = createFirestoreV4PilotTripWriter({
    db: {},
    uid: 'alice',
    telemetryEnabled: false,
    repository,
    composition,
  });

  await writer.save({
    id: TRIP_ID,
    name: 'Europa',
    currency: 'EUR',
    origin: ORIGIN,
    originDetails: null,
    segments: [],
    places: [],
    routeConnections: [],
    placeOrderVersion: 1,
    notes: [],
    checklist: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const baseline = await localPersistence.getEntity(rootKey());
  assert.deepEqual(baseline.payload.origin, ORIGIN);
  assert.equal(baseline.serverVersion, 3);
  assert.equal(baseline.serverStatus, 'active');
  assert.ok(committed.every((intent) => intent.entityType !== 'trip'));
  await writer.close();
});
