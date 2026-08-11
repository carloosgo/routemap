import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import {
  V4_REMOTE_ERROR_KIND,
  V4RemoteSyncError,
  createV4SyncCoordinator,
} from '../src/modules/storage-v4/syncCoordinator.js';
import { V4_LOCAL_STATES } from '../src/modules/storage-v4/storageV4Contract.js';

const entityKey = 'alice/trip-1/segment/segment-1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function seedDevice(store, note) {
  await store.putEntity({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    payload: { note },
    serverVersion: 1,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    state: V4_LOCAL_STATES.DIRTY,
    lastModifiedLocal: 1000,
  });
  await store.putMutation({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    operation: 'update',
    baseVersion: 1,
    baseStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    payload: { note },
    createdAtLocal: 900,
    updatedAtLocal: 1000,
    attempts: 0,
    nextAttemptAt: null,
  });
}

function sharedVersionedGateway() {
  let remote = {
    serverVersion: 1,
    serverStatus: 'active',
    payload: { note: 'base' },
  };

  return {
    gateway: {
      async writeMutation(mutation) {
        if (mutation.baseVersion !== remote.serverVersion) {
          throw new V4RemoteSyncError(
            V4_REMOTE_ERROR_KIND.CONFLICT,
            'version conflict',
            { remoteEntity: clone(remote) }
          );
        }
        remote = {
          serverVersion: remote.serverVersion + 1,
          serverStatus: mutation.desiredStatus,
          payload: clone(mutation.payload),
        };
        return {
          serverVersion: remote.serverVersion,
          serverStatus: remote.serverStatus,
        };
      },
    },
    snapshot: () => clone(remote),
  };
}

test('dos dispositivos sobre la misma entidad conservan la edición perdedora como conflicto explícito', async () => {
  const deviceA = createMemoryV4LocalPersistence();
  const deviceB = createMemoryV4LocalPersistence();
  await seedDevice(deviceA, 'edición A');
  await seedDevice(deviceB, 'edición B');

  const remote = sharedVersionedGateway();
  const coordinatorA = createV4SyncCoordinator({
    localPersistence: deviceA,
    remoteGateway: remote.gateway,
    contextId: 'device-a',
    now: () => 2000,
  });
  const coordinatorB = createV4SyncCoordinator({
    localPersistence: deviceB,
    remoteGateway: remote.gateway,
    contextId: 'device-b',
    now: () => 2100,
  });

  const first = await coordinatorA.flush({ userId: 'alice' });
  assert.equal(first.synced, 1);
  assert.deepEqual(remote.snapshot(), {
    serverVersion: 2,
    serverStatus: 'active',
    payload: { note: 'edición A' },
  });

  const second = await coordinatorB.flush({ userId: 'alice' });
  assert.equal(second.conflicts, 1);
  assert.equal(second.synced, 0);

  const localB = await deviceB.getEntity(entityKey);
  assert.equal(localB.state, V4_LOCAL_STATES.CONFLICT);
  assert.deepEqual(localB.payload, { note: 'edición B' });
  assert.deepEqual(localB.conflict.payload, { note: 'edición A' });
  assert.equal(await deviceB.getMutation(entityKey), null);

  assert.deepEqual(remote.snapshot().payload, { note: 'edición A' });
});
