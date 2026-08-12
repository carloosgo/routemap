import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createV4SyncCoordinator } from '../src/modules/storage-v4/syncCoordinator.js';
import { createV4SyncRuntime } from '../src/modules/storage-v4/syncRuntime.js';
import { createFirestoreV4SyncGateway } from '../src/infrastructure/firebase/firestoreV4SyncGateway.js';
import { createFirestoreV4PilotTripWriter } from '../src/infrastructure/firebase/firestoreV4PilotTripWriter.js';

function clone(value) {
  return value == null ? value : globalThis.structuredClone(value);
}

function segment(id, note = '') {
  return {
    id,
    origin: null,
    destination: null,
    startDate: '',
    endDate: '',
    expenses: createExpenses(),
    note,
  };
}

function trip(overrides = {}) {
  return {
    id: 'trip-pilot',
    name: 'Europa',
    currency: 'EUR',
    segments: [segment('segment-1', 'tren')],
    places: [],
    routeConnections: [],
    placeOrderVersion: 1,
    notes: [{ id: 'note-1', title: 'Reserva', text: 'Hotel' }],
    checklist: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createRemoteRepository() {
  let root = null;
  const children = new Map();
  const childKey = (tripId, type, id) => `${tripId}/${type}/${id}`;

  return {
    snapshot() {
      return {
        root: clone(root),
        children: Array.from(children.values()).map(clone),
      };
    },
    async getTripSummary() {
      return clone(root);
    },
    async createTripRoot(raw) {
      if (root) throw Object.assign(new Error('exists'), { code: 'permission-denied' });
      root = {
        ...clone(raw),
        schemaVersion: 4,
        status: 'active',
        version: 1,
        segmentCount: 0,
        placeCount: 0,
        total: 0,
      };
      return { id: raw.id, version: 1 };
    },
    async updateTripMetadata(raw, baseVersion) {
      if (!root || root.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      root = { ...root, id: raw.id, name: raw.name, currency: raw.currency, version: baseVersion + 1 };
      return { id: raw.id, version: root.version };
    },
    async listEntities(tripId, entityType, { includeDeleted = false } = {}) {
      return Array.from(children.values())
        .filter((item) => item.tripId === tripId && item.entityType === entityType)
        .filter((item) => includeDeleted || item.status === 'active')
        .sort((left, right) => left.rank.localeCompare(right.rank))
        .map((item) => {
          const { tripId: _tripId, entityType: _entityType, ...data } = item;
          return clone(data);
        });
    },
    async getEntity(tripId, entityType, entityId) {
      const item = children.get(childKey(tripId, entityType, entityId));
      if (!item) return null;
      const { tripId: _tripId, entityType: _entityType, ...data } = item;
      return clone(data);
    },
    async createEntity(tripId, entityType, raw, rank) {
      const key = childKey(tripId, entityType, raw.id);
      if (children.has(key)) throw Object.assign(new Error('exists'), { code: 'permission-denied' });
      children.set(key, {
        tripId,
        entityType,
        ...clone(raw),
        rank,
        status: 'active',
        version: 1,
      });
      return { id: raw.id, version: 1 };
    },
    async updateEntity(tripId, entityType, raw, rank, baseVersion) {
      const key = childKey(tripId, entityType, raw.id);
      const current = children.get(key);
      if (!current || current.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      children.set(key, {
        ...current,
        ...clone(raw),
        rank,
        status: 'active',
        version: baseVersion + 1,
      });
      return { id: raw.id, version: baseVersion + 1 };
    },
    async softDeleteEntity(tripId, entityType, entityId, baseVersion) {
      const key = childKey(tripId, entityType, entityId);
      const current = children.get(key);
      if (!current || current.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      children.set(key, { ...current, status: 'deleted', version: baseVersion + 1 });
      return { id: entityId, version: baseVersion + 1 };
    },
    async restoreEntity(tripId, entityType, entityId, baseVersion, raw, rank) {
      const key = childKey(tripId, entityType, entityId);
      const current = children.get(key);
      if (!current || current.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      children.set(key, {
        ...current,
        ...clone(raw),
        rank,
        status: 'active',
        version: baseVersion + 1,
      });
      return { id: entityId, version: baseVersion + 1 };
    },
  };
}

function createWriterHarness() {
  const remoteRepository = createRemoteRepository();
  const localPersistence = createMemoryV4LocalPersistence();
  const gateway = createFirestoreV4SyncGateway({
    userId: 'user-pilot',
    repository: remoteRepository,
  });
  const coordinator = createV4SyncCoordinator({
    localPersistence,
    gateway,
    userId: 'user-pilot',
    contextId: 'pilot-test',
    now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    random: () => 0.5,
  });
  const runtime = createV4SyncRuntime({
    userId: 'user-pilot',
    contextId: 'pilot-test',
    localPersistence,
    coordinator,
    isOnline: true,
    now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  const writer = createFirestoreV4PilotTripWriter({
    userId: 'user-pilot',
    repository: remoteRepository,
    localPersistence,
    runtime,
  });

  return { writer, remoteRepository };
}

test('writer pilot crea root primero, persiste hijos incrementalmente y actualiza solo cambios posteriores', async () => {
  const { writer, remoteRepository } = createWriterHarness();

  const created = await writer.save(trip());
  assert.equal(created.storageVersion, 4);
  assert.equal(created.schemaVersion, 4);
  assert.equal(created.name, 'Europa');

  let snapshot = remoteRepository.snapshot();
  assert.equal(snapshot.root.version, 1);
  assert.equal(snapshot.children.length, 2);
  assert.deepEqual(snapshot.children.map((item) => item.entityType).sort(), ['notes', 'segments']);

  const updated = await writer.save(trip({
    name: 'Europa 2026',
    segments: [segment('segment-1', 'tren nocturno'), segment('segment-2', 'vuelo')],
    notes: [],
  }));

  assert.equal(updated.name, 'Europa 2026');
  snapshot = remoteRepository.snapshot();
  assert.equal(snapshot.root.version, 2);
  assert.equal(snapshot.children.find((item) => item.id === 'segment-1').version, 2);
  assert.equal(snapshot.children.find((item) => item.id === 'segment-2').version, 1);
  assert.equal(snapshot.children.find((item) => item.id === 'note-1').status, 'deleted');

  await writer.close();
});

test('writer pilot restaura una entidad eliminada con el payload editado actual', async () => {
  const { writer, remoteRepository } = createWriterHarness();

  await writer.save(trip());
  await writer.save(trip({ notes: [] }));
  await writer.save(trip({ notes: [{ id: 'note-1', title: 'Reserva nueva', text: 'Hostal' }] }));

  const restored = remoteRepository.snapshot().children.find((item) => item.id === 'note-1');
  assert.equal(restored.status, 'active');
  assert.equal(restored.version, 3);
  assert.equal(restored.title, 'Reserva nueva');
  assert.equal(restored.text, 'Hostal');

  await writer.close();
});
