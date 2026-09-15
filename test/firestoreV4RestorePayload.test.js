import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreV4SyncGateway } from '../src/infrastructure/firebase/firestoreV4SyncGateway.js';

function repository(overrides = {}) {
  return {
    async createTripRoot() { return { version: 1 }; },
    async updateTripMetadata() { return { version: 2 }; },
    async getTripSummary() { return null; },
    async createEntity() { return { version: 1 }; },
    async updateEntity() { return { version: 2 }; },
    async softDeleteEntity() { return { version: 2 }; },
    async restoreEntity() { return { version: 5 }; },
    async getEntity() { return null; },
    ...overrides,
  };
}

test('RESTORE de hijo reenvía payload, rank y baseVersion en una sola escritura versionada', async () => {
  let call = null;
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async restoreEntity(...args) {
        call = args;
        return { version: 5 };
      },
    }),
  });

  const result = await gateway.writeMutation({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'note',
    entityId: 'note-1',
    operation: 'restore',
    baseVersion: 4,
    baseStatus: 'deleted',
    desiredStatus: 'active',
    localRevision: 2,
    payload: {
      id: 'note-1',
      rank: '000000lfls',
      title: 'Nueva',
      text: 'contenido editado antes de restaurar',
    },
    createdAtLocal: 100,
    updatedAtLocal: 200,
    attempts: 0,
    nextAttemptAt: null,
  });

  assert.deepEqual(result, { serverVersion: 5, serverStatus: 'active' });
  assert.equal(call[0], 'trip-1');
  assert.equal(call[1], 'note');
  assert.equal(call[2], 'note-1');
  assert.equal(call[3], 4);
  assert.equal(call[4].id, 'note-1');
  assert.equal(call[4].title, 'Nueva');
  assert.equal(call[4].text, 'contenido editado antes de restaurar');
  assert.equal(call[5], '000000lfls');
});
