import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeSyncTelemetryBatch,
  sanitizeSyncTelemetryEvent,
} from './v4SyncTelemetryModel.js';

test('acepta flush agregado sin identidad ni payload', () => {
  assert.deepEqual(
    sanitizeSyncTelemetryEvent({
      event: 'flush',
      outcome: 'success',
      reason: 'reconnect',
      durationMs: 245,
      pending: 2,
      attempted: 3,
      synced: 2,
      retried: 1,
      conflicts: 0,
      retryScheduled: true,
    }),
    {
      event: 'flush',
      outcome: 'success',
      reason: 'reconnect',
      durationMs: 245,
      pending: 2,
      attempted: 3,
      synced: 2,
      retried: 1,
      conflicts: 0,
      retryScheduled: true,
    }
  );
});

test('acepta recuperación de cola con edad agregada', () => {
  assert.deepEqual(
    sanitizeSyncTelemetryEvent({
      event: 'queue-recovery',
      pending: 4,
      oldestPendingAgeMs: 12_500,
    }),
    {
      event: 'queue-recovery',
      pending: 4,
      oldestPendingAgeMs: 12_500,
    }
  );
});

test('rechaza campos sensibles o desconocidos', () => {
  for (const key of ['uid', 'userId', 'tripId', 'entityId', 'entityKey', 'payload', 'note']) {
    assert.throws(
      () => sanitizeSyncTelemetryEvent({
        event: 'queue-recovery',
        pending: 1,
        oldestPendingAgeMs: 10,
        [key]: 'secret',
      }),
      /no permitido/
    );
  }
});

test('rechaza mensajes de error libres y solo admite tokens acotados', () => {
  assert.throws(
    () => sanitizeSyncTelemetryEvent({
      event: 'flush',
      outcome: 'unexpected-error',
      reason: 'save-now',
      durationMs: 1,
      pending: null,
      errorName: 'Error',
      errorCode: 'permission denied because trip secret leaked',
    }),
    /errorCode inválido/
  );
});

test('limita tamaño de lote', () => {
  const event = {
    event: 'queue-recovery',
    pending: 0,
    oldestPendingAgeMs: 0,
  };
  assert.equal(sanitizeSyncTelemetryBatch([event]).length, 1);
  assert.throws(() => sanitizeSyncTelemetryBatch([]), /Lote/);
  assert.throws(() => sanitizeSyncTelemetryBatch(Array.from({ length: 21 }, () => event)), /Lote/);
});
