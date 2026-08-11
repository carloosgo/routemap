import test from 'node:test';
import assert from 'node:assert/strict';
import { createV4SyncLifecycleController } from '../src/modules/storage-v4/syncLifecycleController.js';

function timers(start = 1000) {
  let nowMs = start;
  return {
    now: () => nowMs,
    setNow(value) { nowMs = value; },
    setTimer: () => 1,
    clearTimer: () => {},
  };
}

test('sync observability: flush exitoso emite solo datos operacionales agregados', async () => {
  const clock = timers();
  const metrics = [];
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: true, pending: 2, nextAttemptAt: 9000 }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onMetric: (metric) => metrics.push(metric),
  });

  controller.markDirty();
  clock.setNow(1250);
  await controller.flushNow();

  assert.deepEqual(metrics, [{
    event: 'flush',
    outcome: 'success',
    reason: 'save-now',
    durationMs: 0,
    pending: 2,
    retryScheduled: true,
  }]);
  const serialized = JSON.stringify(metrics);
  assert.doesNotMatch(serialized, /userId|tripId|entityId|entityKey|payload|uid/i);
});

test('sync observability: no liderazgo queda visible sin identidad de contexto', async () => {
  const clock = timers();
  const metrics = [];
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: false }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onMetric: (metric) => metrics.push(metric),
  });

  controller.markDirty();
  await controller.flushNow();

  assert.deepEqual(metrics, [{
    event: 'flush',
    outcome: 'not-leader',
    reason: 'save-now',
    durationMs: 0,
    pending: null,
  }]);
});

test('sync observability: error inesperado se sanea y no filtra el mensaje', async () => {
  const clock = timers();
  const metrics = [];
  const error = new Error('trip-secret-content');
  error.code = 'permission-denied';
  const controller = createV4SyncLifecycleController({
    flush: async () => { throw error; },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onMetric: (metric) => metrics.push(metric),
  });

  controller.markDirty();
  const result = await controller.flushNow();

  assert.equal(result.error, error);
  assert.deepEqual(metrics, [{
    event: 'flush',
    outcome: 'unexpected-error',
    reason: 'save-now',
    durationMs: 0,
    pending: null,
    errorName: 'Error',
    errorCode: 'permission-denied',
  }]);
  assert.doesNotMatch(JSON.stringify(metrics), /trip-secret-content/);
});

test('sync observability: fallo del sink no rompe el guardado', async () => {
  const clock = timers();
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: true, pending: 0, nextAttemptAt: null }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onMetric: () => { throw new Error('metrics offline'); },
  });

  controller.markDirty();
  const result = await controller.flushNow();
  assert.deepEqual(result, { leader: true, pending: 0, nextAttemptAt: null });
});
