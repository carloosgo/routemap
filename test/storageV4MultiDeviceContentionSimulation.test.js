import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import {
  V4_REMOTE_ERROR_KIND,
  V4RemoteSyncError,
  createV4SyncCoordinator,
} from '../src/modules/storage-v4/syncCoordinator.js';
import { V4_LOCAL_STATES } from '../src/modules/storage-v4/storageV4Contract.js';

const USER_ID = 'capacity-user';
const TRIP_ID = 'trip-contention';
const ENTITY_TYPE = 'segment';
const ENTITY_ID = 'segment-1';
const ENTITY_KEY = `${USER_ID}/${TRIP_ID}/${ENTITY_TYPE}/${ENTITY_ID}`;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function seed(store, deviceIndex) {
  const payload = { note: `device-${deviceIndex}` };
  await store.putEntity({
    userId: USER_ID,
    tripId: TRIP_ID,
    entityType: ENTITY_TYPE,
    entityId: ENTITY_ID,
    payload,
    serverVersion: 1,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    state: V4_LOCAL_STATES.DIRTY,
    lastModifiedLocal: 1_000 + deviceIndex,
  });
  await store.putMutation({
    userId: USER_ID,
    tripId: TRIP_ID,
    entityType: ENTITY_TYPE,
    entityId: ENTITY_ID,
    operation: 'update',
    baseVersion: 1,
    baseStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    payload,
    createdAtLocal: 900,
    updatedAtLocal: 1_000 + deviceIndex,
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

test('Phase K: 100 dispositivos contendiendo por una entidad producen un ganador y 99 conflictos preservados', async () => {
  const deviceCount = 100;
  const remote = sharedVersionedGateway();
  const stores = [];
  const coordinators = [];

  for (let index = 0; index < deviceCount; index += 1) {
    const store = createMemoryV4LocalPersistence();
    await seed(store, index);
    stores.push(store);
    coordinators.push(createV4SyncCoordinator({
      localPersistence: store,
      remoteGateway: remote.gateway,
      contextId: `device-${index}`,
      now: () => 2_000 + index,
    }));
  }

  const results = [];
  for (const coordinator of coordinators) {
    results.push(await coordinator.flush({ userId: USER_ID }));
  }

  const synced = results.reduce((sum, result) => sum + result.synced, 0);
  const conflicts = results.reduce((sum, result) => sum + result.conflicts, 0);
  assert.equal(synced, 1);
  assert.equal(conflicts, deviceCount - 1);
  assert.equal(remote.snapshot().serverVersion, 2);
  assert.deepEqual(remote.snapshot().payload, { note: 'device-0' });

  const winner = await stores[0].getEntity(ENTITY_KEY);
  assert.notEqual(winner.state, V4_LOCAL_STATES.CONFLICT);
  assert.equal(await stores[0].getMutation(ENTITY_KEY), null);

  for (let index = 1; index < deviceCount; index += 1) {
    const entity = await stores[index].getEntity(ENTITY_KEY);
    assert.equal(entity.state, V4_LOCAL_STATES.CONFLICT);
    assert.deepEqual(entity.payload, { note: `device-${index}` });
    assert.deepEqual(entity.conflict.payload, { note: 'device-0' });
    assert.equal(await stores[index].getMutation(ENTITY_KEY), null);
  }
});
