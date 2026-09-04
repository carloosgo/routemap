import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreV4SyncGateway } from '../src/infrastructure/firebase/firestoreV4SyncGateway.js';
import {
  V4_REMOTE_ERROR_KIND,
  V4RemoteSyncError,
} from '../src/modules/storage-v4/syncCoordinator.js';
import { V4_MUTATION_OPERATIONS } from '../src/modules/storage-v4/storageV4Contract.js';

function mutation(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    operation: V4_MUTATION_OPERATIONS.UPDATE,
    baseVersion: 3,
    baseStatus: 'active',
    desiredStatus: 'active',
    localRevision: 4,
    payload: {
      id: 'segment-1',
      rank: '0000001000',
      note: 'local',
    },
    createdAtLocal: 100,
    updatedAtLocal: 100,
    attempts: 0,
    nextAttemptAt: null,
    ...overrides,
  };
}

function repository(overrides = {}) {
  return {
    async createTripRoot() { return { version: 1 }; },
    async updateTripMetadata() { return { version: 4 }; },
    async getTripSummary() { return null; },
    async createEntity() { return { version: 1 }; },
    async updateEntity() { return { version: 4 }; },
    async softDeleteEntity() { return { version: 4 }; },
    async restoreEntity() { return { version: 4 }; },
    async getEntity() { return null; },
    ...overrides,
  };
}

test('UPDATE de hijo conserva rank, payload e optimistic baseVersion', async () => {
  let call = null;
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async updateEntity(...args) {
        call = args;
        return { version: 4 };
      },
    }),
  });

  const result = await gateway.writeMutation(mutation());
  assert.deepEqual(result, { serverVersion: 4, serverStatus: 'active' });
  assert.equal(call[0], 'trip-1');
  assert.equal(call[1], 'segment');
  assert.equal(call[2].id, 'segment-1');
  assert.equal(call[2].note, 'local');
  assert.equal(call[3], '0000001000');
  assert.equal(call[4], 3);
});

test('DELETE no exige rank y reporta tombstone confirmado', async () => {
  let call = null;
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async softDeleteEntity(...args) {
        call = args;
        return { version: 4 };
      },
    }),
  });

  const result = await gateway.writeMutation(mutation({
    operation: V4_MUTATION_OPERATIONS.DELETE,
    desiredStatus: 'deleted',
    payload: null,
  }));
  assert.deepEqual(result, { serverVersion: 4, serverStatus: 'deleted' });
  assert.deepEqual(call, ['trip-1', 'segment', 'segment-1', 3]);
});

test('solo errores Firestore claramente transitorios se tipan como retryable', async () => {
  const transient = Object.assign(new Error('offline'), { code: 'unavailable' });
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async updateEntity() { throw transient; },
    }),
  });

  await assert.rejects(
    gateway.writeMutation(mutation()),
    (error) => error instanceof V4RemoteSyncError
      && error.kind === V4_REMOTE_ERROR_KIND.RETRYABLE
  );
});

test('permission-denied solo se convierte en conflicto si el servidor avanzó', async () => {
  const denied = Object.assign(new Error('rules rejected stale write'), {
    code: 'permission-denied',
  });
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async updateEntity() { throw denied; },
      async getEntity() {
        return {
          id: 'segment-1',
          rank: '0000001000',
          note: 'remoto',
          status: 'active',
          version: 5,
          createdAt: { ignored: true },
          updatedAt: { ignored: true },
          deletedAt: null,
        };
      },
    }),
  });

  await assert.rejects(
    gateway.writeMutation(mutation()),
    (error) => {
      assert.ok(error instanceof V4RemoteSyncError);
      assert.equal(error.kind, V4_REMOTE_ERROR_KIND.CONFLICT);
      assert.equal(error.remoteEntity.serverVersion, 5);
      assert.equal(error.remoteEntity.serverStatus, 'active');
      assert.deepEqual(error.remoteEntity.payload, {
        id: 'segment-1',
        rank: '0000001000',
        note: 'remoto',
      });
      return true;
    }
  );
});

test('permission-denied con misma versión se propaga como error de reglas/autorización', async () => {
  const denied = Object.assign(new Error('not a version conflict'), {
    code: 'firestore/permission-denied',
  });
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async updateEntity() { throw denied; },
      async getEntity() {
        return { id: 'segment-1', status: 'active', version: 3 };
      },
    }),
  });

  await assert.rejects(
    gateway.writeMutation(mutation()),
    (error) => error === denied
  );
});

test('si no se puede verificar el remoto, permission-denied tampoco se reclasifica', async () => {
  const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
  const readFailure = new Error('cannot verify server state');
  const gateway = createFirestoreV4SyncGateway({
    repository: repository({
      async updateEntity() { throw denied; },
      async getEntity() { throw readFailure; },
    }),
  });

  await assert.rejects(
    gateway.writeMutation(mutation()),
    (error) => error === denied
  );
});

test('lifecycle DELETE/RESTORE del viaje no se activa antes de Gate E', async () => {
  const gateway = createFirestoreV4SyncGateway({ repository: repository() });
  await assert.rejects(
    gateway.writeMutation(mutation({
      entityType: 'trip',
      entityId: 'trip-1',
      operation: V4_MUTATION_OPERATIONS.DELETE,
      desiredStatus: 'deleted',
      payload: null,
    })),
    /gate de lifecycle v4/
  );
});
