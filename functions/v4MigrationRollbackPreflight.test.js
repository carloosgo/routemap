import test from 'node:test';
import assert from 'node:assert/strict';
import { v4MigrationDigest } from './v4MigrationStore.js';
import { readFreshV4MigrationRollbackPreflight } from './v4MigrationRollbackPreflight.js';

function snapshot(data) {
  return {
    exists: data != null,
    data() {
      return data;
    },
  };
}

function querySnapshot(items = []) {
  return {
    docs: items.map((data) => ({
      id: data.id,
      data() {
        return data;
      },
    })),
  };
}

function fakeDb({ root, checkpoint, collections = {}, contributions = [] }) {
  const collectionSnapshot = (name) => querySnapshot(collections[name] || []);
  const tripRef = {
    async get() {
      return snapshot(root);
    },
    collection(name) {
      if (name === '__aggregateContributions') {
        return { get: async () => querySnapshot(contributions) };
      }
      return { get: async () => collectionSnapshot(name) };
    },
  };
  const checkpointRef = {
    async get() {
      return snapshot(checkpoint);
    },
  };
  const userRef = {
    collection(name) {
      if (name === 'trips') return { doc: () => tripRef };
      if (name === '__tripMigrations') return { doc: () => checkpointRef };
      throw new Error(`colección inesperada ${name}`);
    },
  };
  return {
    doc(path) {
      assert.equal(path, 'users/alice');
      return userRef;
    },
  };
}

function freshFixture() {
  const root = {
    id: 'trip-v4',
    schemaVersion: 4,
    status: 'active',
    version: 1,
    name: 'Europa',
    currency: 'EUR',
    createdAt: 'created',
    updatedAt: 'updated',
    deletedAt: null,
    purgeAfter: null,
    segmentCount: 0,
    placeCount: 0,
    total: 0,
  };
  const collections = {
    segments: [],
    places: [],
    connections: [],
    notes: [],
    checklist: [],
  };
  const contributions = [];
  const expectedDigest = v4MigrationDigest({ root, collections, contributions });
  const checkpoint = {
    state: 'complete',
    sourceStorageVersion: 3,
    expectedDigest,
  };
  return { root, checkpoint, collections, contributions, expectedDigest };
}

test('rollback preflight recomputa digest actual y acepta solo migración fresca intacta', async () => {
  const fixture = freshFixture();
  const result = await readFreshV4MigrationRollbackPreflight({
    db: fakeDb(fixture),
    userId: 'alice',
    tripId: 'trip-v4',
  });

  assert.equal(result.rollbackEligible, true);
  assert.equal(result.sourceStorageVersion, 3);
  assert.equal(result.targetSchemaVersion, 4);
  assert.equal(result.targetVersion, 1);
  assert.equal(result.expectedDigest, fixture.expectedDigest);
  assert.deepEqual(result.entityCounts, {
    segments: 0,
    places: 0,
    connections: 0,
    notes: 0,
    checklist: 0,
  });
});

test('rollback preflight falla cerrado si root avanzó después de migrar', async () => {
  const fixture = freshFixture();
  fixture.root.version = 2;
  await assert.rejects(
    readFreshV4MigrationRollbackPreflight({
      db: fakeDb(fixture),
      userId: 'alice',
      tripId: 'trip-v4',
    }),
    /estado fresco requerido/
  );
});

test('rollback preflight detecta contenido v4 alterado aunque checkpoint siga complete', async () => {
  const fixture = freshFixture();
  fixture.collections.notes = [{
    id: 'note-new',
    rank: '0000000001',
    status: 'active',
    version: 1,
    updatedAt: 'later',
  }];

  await assert.rejects(
    readFreshV4MigrationRollbackPreflight({
      db: fakeDb(fixture),
      userId: 'alice',
      tripId: 'trip-v4',
    }),
    /estado v4 cambió/
  );
});
