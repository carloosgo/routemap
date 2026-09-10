import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createV4SyncCoordinator } from '../src/modules/storage-v4/syncCoordinator.js';
import { createV4SyncRuntime } from '../src/modules/storage-v4/syncRuntime.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';
import { createFirestoreV4SyncGateway } from '../src/infrastructure/firebase/firestoreV4SyncGateway.js';
import { createFirestoreV4EditorTripWriter } from '../src/infrastructure/firebase/firestoreV4EditorTripWriter.js';

function clone(value) {
  return value == null ? value : globalThis.structuredClone(value);
}

function segment(note) {
  return {
    id: 'segment-1',
    origin: null,
    destination: null,
    startDate: '',
    endDate: '',
    expenses: createExpenses(),
    note,
  };
}

function trip(note) {
  return {
    id: 'trip-editor',
    name: 'Europa',
    currency: 'EUR',
    segments: [segment(note)],
    places: [],
    routeConnections: [],
    placeOrderVersion: 1,
    notes: [],
    checklist: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-17T12:00:00.000Z',
  };
}

function createSeededRepository() {
  const rank = initialRankForPosition(0);
  let root = {
    id: 'trip-editor',
    name: 'Europa',
    currency: 'EUR',
    schemaVersion: 4,
    status: 'active',
    version: 1,
    segmentCount: 1,
    placeCount: 0,
    total: 0,
  };
  const children = new Map([
    ['segment:segment-1', {
      ...segment('original'),
      rank,
      status: 'active',
      version: 1,
    }],
  ]);
  const counters = {
    getTripSummary: 0,
    listEntities: 0,
    updateEntity: 0,
  };

  function key(type, id) {
    return `${type}:${id}`;
  }

  return {
    counters,
    remoteState() {
      return {
        tripId: root.id,
        remoteRoot: clone(root),
        remoteCollections: {
          segments: [clone(children.get('segment:segment-1'))],
          places: [],
          routeConnections: [],
          notes: [],
          checklist: [],
        },
      };
    },
    segmentSnapshot() {
      return clone(children.get('segment:segment-1'));
    },
    async getTripSummary() {
      counters.getTripSummary += 1;
      return clone(root);
    },
    async listEntities(_tripId, type, { includeDeleted = false } = {}) {
      counters.listEntities += 1;
      return Array.from(children.entries())
        .filter(([entryKey]) => entryKey.startsWith(`${type}:`))
        .map(([, item]) => item)
        .filter((item) => includeDeleted || item.status === 'active')
        .map(clone);
    },
    async getEntity(_tripId, type, id) {
      return clone(children.get(key(type, id)) || null);
    },
    async createTripRoot(raw) {
      root = { ...clone(raw), schemaVersion: 4, status: 'active', version: 1 };
      return { id: raw.id, version: 1 };
    },
    async updateTripMetadata(raw, baseVersion) {
      if (root.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      root = { ...root, ...clone(raw), version: baseVersion + 1 };
      return { id: root.id, version: root.version };
    },
    async createEntity(_tripId, type, raw, entityRank) {
      children.set(key(type, raw.id), {
        ...clone(raw), rank: entityRank, status: 'active', version: 1,
      });
      return { id: raw.id, version: 1 };
    },
    async updateEntity(_tripId, type, raw, entityRank, baseVersion) {
      counters.updateEntity += 1;
      const current = children.get(key(type, raw.id));
      if (!current || current.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      const next = {
        ...current,
        ...clone(raw),
        rank: entityRank,
        status: 'active',
        version: baseVersion + 1,
      };
      children.set(key(type, raw.id), next);
      return { id: raw.id, version: next.version };
    },
    async softDeleteEntity(_tripId, type, id, baseVersion) {
      const current = children.get(key(type, id));
      if (!current || current.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      children.set(key(type, id), { ...current, status: 'deleted', version: baseVersion + 1 });
      return { id, version: baseVersion + 1 };
    },
    async restoreEntity(_tripId, type, id, baseVersion, raw, entityRank) {
      const current = children.get(key(type, id));
      if (!current || current.version !== baseVersion) {
        throw Object.assign(new Error('stale'), { code: 'permission-denied' });
      }
      children.set(key(type, id), {
        ...current,
        ...clone(raw),
        rank: entityRank,
        status: 'active',
        version: baseVersion + 1,
      });
      return { id, version: baseVersion + 1 };
    },
  };
}

function compositionFor(repository) {
  const localPersistence = createMemoryV4LocalPersistence();
  const remoteGateway = createFirestoreV4SyncGateway({ repository });
  const syncCoordinator = createV4SyncCoordinator({
    localPersistence,
    remoteGateway,
    contextId: 'editor-writer-test',
    now: () => Date.now(),
  });
  const runtime = createV4SyncRuntime({
    userId: 'alice',
    localPersistence,
    syncCoordinator,
    now: () => Date.now(),
  });
  return {
    localPersistence,
    syncCoordinator,
    runtime,
    async stop() { runtime.stop(); },
  };
}

test('editor v4 coalesce cambios rápidos sin reads remotos ni writes por tecla', async () => {
  const repository = createSeededRepository();
  const composition = compositionFor(repository);
  const writer = createFirestoreV4EditorTripWriter({
    db: {},
    uid: 'alice',
    telemetryEnabled: false,
    repository,
    composition,
  });

  await writer.acceptRemoteState(repository.remoteState());
  const readsBefore = {
    getTripSummary: repository.counters.getTripSummary,
    listEntities: repository.counters.listEntities,
  };

  await writer.stage(trip('primera edición'));
  await writer.stage(trip('segunda edición'));

  assert.equal(repository.counters.getTripSummary, readsBefore.getTripSummary);
  assert.equal(repository.counters.listEntities, readsBefore.listEntities);
  assert.equal(repository.counters.updateEntity, 0);

  const pending = await composition.localPersistence.listMutations({
    userId: 'alice',
    tripId: 'trip-editor',
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entityType, 'segment');
  assert.equal(pending[0].baseVersion, 1);
  assert.equal(pending[0].payload.note, 'segunda edición');
  assert.ok(pending[0].localRevision >= 2);

  const pendingState = await writer.getPersistenceState('trip-editor');
  assert.equal(pendingState.state, 'pending');
  assert.equal(pendingState.pending, 1);

  await writer.save(trip('segunda edición'));
  assert.equal(repository.counters.updateEntity, 1);
  assert.equal(repository.segmentSnapshot().note, 'segunda edición');
  assert.equal(repository.segmentSnapshot().version, 2);
  assert.deepEqual(
    await composition.localPersistence.listMutations({ userId: 'alice', tripId: 'trip-editor' }),
    []
  );
  assert.equal((await writer.getPersistenceState('trip-editor')).state, 'saved');

  await writer.close();
});
