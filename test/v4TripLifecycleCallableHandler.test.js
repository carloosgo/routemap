import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_TRIP_LIFECYCLE_QUOTA,
  createV4TripLifecycleCallableHandler,
} from '../functions/v4TripLifecycleCallableHandler.js';
import { V4TripLifecycleError } from '../functions/v4TripLifecycleStore.js';

function codeOf(error) {
  return String(error?.code || '').replace(/^functions\//, '');
}

function request(data = {}, uid = 'alice') {
  return { auth: uid ? { uid } : null, data };
}

function validData(overrides = {}) {
  return {
    tripId: 'trip-1',
    operationId: 'operation_123',
    action: 'delete',
    baseVersion: 4,
    ...overrides,
  };
}

test('callable deriva UID de Auth y nunca acepta retentionMs del cliente', async () => {
  const db = { marker: 'db' };
  let received;
  let quota;
  const handler = createV4TripLifecycleCallableHandler({
    db,
    authenticate: (value) => value.auth.uid,
    enforceRateLimit: async (value, policy) => {
      assert.equal(value.auth.uid, 'alice');
      quota = policy;
    },
    applyOperation: async (input) => {
      received = input;
      return {
        operationId: input.operationId,
        action: input.action,
        tripId: input.tripId,
        version: 5,
        status: 'deleted',
        deletedAt: { toMillis: () => 1000 },
        purgeAfter: { toMillis: () => 2000 },
        idempotentReplay: false,
      };
    },
  });

  const result = await handler(request({ ...validData(), retentionMs: 1, userId: 'mallory' }));
  assert.deepEqual(received, {
    db,
    userId: 'alice',
    tripId: 'trip-1',
    operationId: 'operation_123',
    action: 'delete',
    baseVersion: 4,
  });
  assert.deepEqual(quota, V4_TRIP_LIFECYCLE_QUOTA);
  assert.deepEqual(result, {
    operationId: 'operation_123',
    action: 'delete',
    tripId: 'trip-1',
    version: 5,
    status: 'deleted',
    deletedAtMs: 1000,
    purgeAfterMs: 2000,
    idempotentReplay: false,
  });
});

test('callable exige autenticación con la política real del backend', async () => {
  const handler = createV4TripLifecycleCallableHandler({
    db: {},
    applyOperation: async () => {
      throw new Error('no debe ejecutarse');
    },
  });

  await assert.rejects(handler(request(validData(), null)), (error) => {
    assert.equal(codeOf(error), 'unauthenticated');
    return true;
  });
});

test('errores de validación del store se publican como invalid-argument', async () => {
  const handler = createV4TripLifecycleCallableHandler({
    db: {},
    authenticate: () => 'alice',
    applyOperation: async () => { throw new TypeError('baseVersion inválida'); },
  });

  await assert.rejects(handler(request(validData())), (error) => {
    assert.equal(codeOf(error), 'invalid-argument');
    assert.match(error.message, /baseVersion/);
    return true;
  });
});

test('conflicto de versión usa aborted y precondiciones no se confunden con error interno', async () => {
  const cases = [
    ['version-conflict', 'aborted'],
    ['failed-precondition', 'failed-precondition'],
    ['operation-id-reused', 'failed-precondition'],
    ['not-found', 'not-found'],
  ];

  for (const [storeCode, expectedCode] of cases) {
    const handler = createV4TripLifecycleCallableHandler({
      db: {},
      authenticate: () => 'alice',
      applyOperation: async () => {
        throw new V4TripLifecycleError(storeCode, `error:${storeCode}`);
      },
    });
    await assert.rejects(handler(request(validData())), (error) => {
      assert.equal(codeOf(error), expectedCode);
      assert.equal(error.message, `error:${storeCode}`);
      return true;
    });
  }
});

test('restore devuelve fechas de papelera nulas y replay explícito', async () => {
  const handler = createV4TripLifecycleCallableHandler({
    db: {},
    authenticate: () => 'alice',
    applyOperation: async () => ({
      operationId: 'operation_456',
      action: 'restore',
      tripId: 'trip-1',
      version: 7,
      status: 'active',
      deletedAt: null,
      purgeAfter: null,
      idempotentReplay: true,
    }),
  });

  const result = await handler(request(validData({
    operationId: 'operation_456',
    action: 'restore',
    baseVersion: 6,
  })));
  assert.equal(result.deletedAtMs, null);
  assert.equal(result.purgeAfterMs, null);
  assert.equal(result.idempotentReplay, true);
});

test('error inesperado se registra sin devolver detalles internos al cliente', async () => {
  const reports = [];
  const handler = createV4TripLifecycleCallableHandler({
    db: {},
    authenticate: () => 'alice',
    applyOperation: async () => {
      const error = new Error('secret database detail');
      error.code = 'SENSITIVE';
      throw error;
    },
    reportError: (...args) => reports.push(args),
  });

  await assert.rejects(handler(request(validData())), (error) => {
    assert.equal(codeOf(error), 'internal');
    assert.doesNotMatch(error.message, /secret|SENSITIVE/i);
    return true;
  });
  assert.equal(reports.length, 1);
  assert.equal(reports[0][1].errorCode, 'SENSITIVE');
});
