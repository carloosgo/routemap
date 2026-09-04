import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_SERVER_STATUS,
  pendingMutationOperation,
  rebasePendingMutation,
  upsertPendingMutation,
} from '../src/modules/storage-v4/pendingMutationModel.js';
import { V4_MUTATION_OPERATIONS } from '../src/modules/storage-v4/storageV4Contract.js';

function intent(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    baseVersion: 5,
    baseStatus: V4_SERVER_STATUS.ACTIVE,
    desiredStatus: V4_SERVER_STATUS.ACTIVE,
    localRevision: 1,
    payload: { note: 'uno' },
    ...overrides,
  };
}

test('operación remota se deriva de estado servidor -> intención local', () => {
  assert.equal(pendingMutationOperation({
    baseVersion: 0,
    baseStatus: 'missing',
    desiredStatus: 'active',
  }), V4_MUTATION_OPERATIONS.CREATE);
  assert.equal(pendingMutationOperation({
    baseVersion: 5,
    baseStatus: 'active',
    desiredStatus: 'active',
  }), V4_MUTATION_OPERATIONS.UPDATE);
  assert.equal(pendingMutationOperation({
    baseVersion: 5,
    baseStatus: 'active',
    desiredStatus: 'deleted',
  }), V4_MUTATION_OPERATIONS.DELETE);
  assert.equal(pendingMutationOperation({
    baseVersion: 6,
    baseStatus: 'deleted',
    desiredStatus: 'active',
  }), V4_MUTATION_OPERATIONS.RESTORE);
});

test('crear y seguir editando produce una sola intención CREATE con payload más nuevo', () => {
  const first = upsertPendingMutation({
    intent: intent({
      baseVersion: 0,
      baseStatus: 'missing',
      localRevision: 1,
      payload: { note: 'uno' },
    }),
    nowMs: 100,
  });
  const second = upsertPendingMutation({
    previous: first,
    intent: intent({
      baseVersion: 0,
      baseStatus: 'missing',
      localRevision: 2,
      payload: { note: 'dos' },
    }),
    nowMs: 200,
  });

  assert.equal(second.operation, V4_MUTATION_OPERATIONS.CREATE);
  assert.equal(second.baseVersion, 0);
  assert.equal(second.localRevision, 2);
  assert.equal(second.createdAtLocal, 100);
  assert.equal(second.updatedAtLocal, 200);
  assert.deepEqual(second.payload, { note: 'dos' });
});

test('entidad creada y borrada antes del primer sync no genera escritura remota', () => {
  const created = upsertPendingMutation({
    intent: intent({
      baseVersion: 0,
      baseStatus: 'missing',
      desiredStatus: 'active',
      localRevision: 1,
    }),
    nowMs: 100,
  });
  const deleted = upsertPendingMutation({
    previous: created,
    intent: intent({
      baseVersion: 0,
      baseStatus: 'missing',
      desiredStatus: 'deleted',
      localRevision: 2,
    }),
    nowMs: 200,
  });
  assert.equal(deleted, null);
});

test('update seguido de delete colapsa a DELETE contra la versión servidor original', () => {
  const updated = upsertPendingMutation({ intent: intent(), nowMs: 100 });
  const deleted = upsertPendingMutation({
    previous: updated,
    intent: intent({
      desiredStatus: 'deleted',
      localRevision: 2,
      payload: { note: 'ya no importa para remoto' },
    }),
    nowMs: 200,
  });
  assert.equal(deleted.operation, V4_MUTATION_OPERATIONS.DELETE);
  assert.equal(deleted.baseVersion, 5);
});

test('delete no sincronizado seguido de restore vuelve a UPDATE, no hace delete+restore', () => {
  const deleted = upsertPendingMutation({
    intent: intent({ desiredStatus: 'deleted' }),
    nowMs: 100,
  });
  const restored = upsertPendingMutation({
    previous: deleted,
    intent: intent({
      desiredStatus: 'active',
      localRevision: 2,
      payload: { note: 'versión final' },
    }),
    nowMs: 200,
  });
  assert.equal(restored.operation, V4_MUTATION_OPERATIONS.UPDATE);
  assert.equal(restored.baseVersion, 5);
});

test('ack de una escritura en vuelo puede rebasar intención local más nueva', () => {
  const pending = upsertPendingMutation({
    intent: intent({
      baseVersion: 0,
      baseStatus: 'missing',
      localRevision: 2,
      payload: { note: 'edición mientras CREATE estaba en vuelo' },
    }),
    nowMs: 200,
  });
  const rebased = rebasePendingMutation(pending, {
    serverVersion: 1,
    serverStatus: 'active',
    nowMs: 300,
  });
  assert.equal(rebased.operation, V4_MUTATION_OPERATIONS.UPDATE);
  assert.equal(rebased.baseVersion, 1);
  assert.equal(rebased.localRevision, 2);
});

test('volver al estado deleted ya confirmado elimina intención RESTORE no enviada', () => {
  const restore = upsertPendingMutation({
    intent: intent({
      baseVersion: 6,
      baseStatus: 'deleted',
      desiredStatus: 'active',
    }),
    nowMs: 100,
  });
  const undoRestore = upsertPendingMutation({
    previous: restore,
    intent: intent({
      baseVersion: 6,
      baseStatus: 'deleted',
      desiredStatus: 'deleted',
      localRevision: 2,
    }),
    nowMs: 200,
  });
  assert.equal(undoRestore, null);
});

test('baseVersion cero solo es válida con estado missing', () => {
  assert.throws(() => pendingMutationOperation({
    baseVersion: 0,
    baseStatus: 'active',
    desiredStatus: 'active',
  }), /inconsistentes/);
});
