import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createV4SyncCoordinator } from '../src/modules/storage-v4/syncCoordinator.js';
import { createV4SyncRuntime } from '../src/modules/storage-v4/syncRuntime.js';
import { createFirestoreV4SyncGateway } from '../src/infrastructure/firebase/firestoreV4SyncGateway.js';
import { createFirestoreV4TripWriter } from '../src/infrastructure/firebase/firestoreV4TripWriter.js';

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
    id: 'trip-v4',
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

function compositionFor(repository) {
  const localPersistence = createMemoryV4LocalPersistence();
  const remoteGateway = createFirestoreV4SyncGateway({ repository });
  const syncCoordinator = createV4SyncCoordinator({
    localPersistence,
    remoteGateway,
    contextId: 'v4-writer-test',
    now: () => 1000,
  });
  const crossContextNotifier = {
    publish() {},
    subscribe() { return () => {}; },
  };
  const runtime = createV4SyncRuntime({
    userId: 'alice',
    localPersistence,
    syncCoordinator,
    crossContextNotifier,
    now: () => 1000,
  });
  return {
    localPersistence,
    syncCoordinator,
    runtime,
    async stop() { runtime.stop(); },
  };
}

test('writer v4 crea root primero, persiste hijos incrementalmente y actualiza solo cambios posteriores', async () => {
  const repository = createRemoteRepository();
  const composition = compositionFor(repository);
  let clock = 1000;
  const writer = createFirestoreV4TripWriter({
    db: {},
    uid: 'alice',
    telemetryEnabled: false,
    repository,
    composition,
    now: () => clock += 1,
  });

  await writer.save(trip());
  let remote = repository.snapshot();
  assert.equal(remote.root.schemaVersion, 4);
  assert.equal(remote.root.version, 1);
  assert.equal(remote.root.name, 'Europa');
  assert.equal(remote.children.length, 2);
  assert.deepEqual(
    remote.children.map((item) => `${item.entityType}:${item.id}`).sort(),
    ['note:note-1', 'segment:segment-1']
  );
  assert.ok(remote.children.every((item) => item.version === 1));

  await writer.save(trip({
    name: 'Europa 2026',
    segments: [],
    notes: [{ id: 'note-1', title: 'Reserva', text: 'Hotel confirmado' }],
  }));
  remote = repository.snapshot();
  assert.equal(remote.root.version, 2);
  assert.equal(remote.root.name, 'Europa 2026');
  const note = remote.children.find((item) => item.id === 'note-1');
  const deletedSegment = remote.children.find((item) => item.id === 'segment-1');
  assert.equal(note.version, 2);
  assert.equal(note.text, 'Hotel confirmado');
  assert.equal(note.status, 'active');
  assert.equal(deletedSegment.version, 2);
  assert.equal(deletedSegment.status, 'deleted');

  const pending = await composition.localPersistence.listMutations({
    userId: 'alice',
    tripId: 'trip-v4',
  });
  assert.deepEqual(pending, []);
  await writer.close();
});

test('writer v4 restaura una entidad eliminada con el payload editado actual', async () => {
  const repository = createRemoteRepository();
  const composition = compositionFor(repository);
  const writer = createFirestoreV4TripWriter({
    db: {}, uid: 'alice', telemetryEnabled: false, repository, composition,
  });

  await writer.save(trip());
  await writer.save(trip({ segments: [] }));
  await writer.save(trip({ segments: [segment('segment-1', 'restaurado y cambiado')] }));

  const restored = repository.snapshot().children.find((item) => item.id === 'segment-1');
  assert.equal(restored.status, 'active');
  assert.equal(restored.version, 3);
  assert.equal(restored.note, 'restaurado y cambiado');
  await writer.close();
});
