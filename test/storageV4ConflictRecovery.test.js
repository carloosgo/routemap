import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { v4EntityKey } from '../src/modules/storage-v4/entityKeyModel.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { V4_LOCAL_STATES } from '../src/modules/storage-v4/storageV4Contract.js';
import { createFirestoreV4PilotTripWriter } from '../src/infrastructure/firebase/firestoreV4PilotTripWriter.js';

function inertComposition(localPersistence) {
  return {
    localPersistence,
    syncCoordinator: {
      async flush() {
        return {
          leader: true,
          attempted: 0,
          synced: 0,
          retried: 0,
          conflicts: 0,
          pending: 0,
          nextAttemptAt: null,
        };
      },
    },
    runtime: {
      async commitIntent() {
        throw new Error('not used');
      },
      async recoverPending() { return 0; },
    },
    async stop() {},
  };
}

test('reabrir v4 acepta estado remoto fresco y limpia conflicto local sin inventar mutation', async () => {
  const local = createMemoryV4LocalPersistence();
  const entity = {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'note',
    entityId: 'note-1',
    payload: {
      id: 'note-1',
      rank: '0000000000',
      title: 'Edición local',
      text: 'perdedora',
    },
    serverVersion: 1,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    state: V4_LOCAL_STATES.CONFLICT,
    conflict: {
      serverVersion: 2,
      serverStatus: 'active',
      payload: {
        id: 'note-1',
        rank: '0000000000',
        title: 'Remota',
        text: 'ganadora',
      },
      detectedAtLocal: 1000,
    },
    lastModifiedLocal: 1000,
  };
  await local.putEntity(entity);

  const writer = createFirestoreV4PilotTripWriter({
    db: {},
    uid: 'alice',
    telemetryEnabled: false,
    repository: {},
    composition: inertComposition(local),
    now: () => 2000,
  });

  const result = await writer.acceptRemoteState({
    tripId: 'trip-1',
    remoteRoot: {
      id: 'trip-1',
      name: 'Europa',
      currency: 'EUR',
      origin: null,
      schemaVersion: 4,
      status: 'active',
      version: 3,
    },
    remoteCollections: {
      segments: [],
      places: [],
      routeConnections: [],
      notes: [{
        id: 'note-1',
        rank: '0000000000',
        title: 'Remota actual',
        text: 'versión 3',
        status: 'active',
        version: 3,
      }],
      checklist: [],
    },
  });

  assert.deepEqual(result, { clearedConflicts: 1 });
  const key = v4EntityKey({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'note',
    entityId: 'note-1',
  });
  const rebased = await local.getEntity(key);
  assert.equal(rebased.state, V4_LOCAL_STATES.CLEAN);
  assert.equal(rebased.serverVersion, 3);
  assert.equal(rebased.serverStatus, 'active');
  assert.equal(rebased.conflict, null);
  assert.equal(rebased.payload.title, 'Remota actual');
  assert.equal(rebased.payload.text, 'versión 3');
  assert.equal(await local.getMutation(key), null);
  await writer.close();
});

test('useSavedTrips conserva lifecycle initialize/close del repositorio v4', async () => {
  const hookSource = await readFile(
    new URL('../src/modules/trips/useSavedTrips.js', import.meta.url),
    'utf8'
  );
  assert.match(hookSource, /await repository\.initialize\?\.\(\)/);
  assert.match(hookSource, /repository\.close\?\.\(\)/);
  assert.match(hookSource, /Cleanup best-effort/);
});
