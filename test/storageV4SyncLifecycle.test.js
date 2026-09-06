import test from 'node:test';
import assert from 'node:assert/strict';
import { createV4SyncLifecycleController } from '../src/modules/storage-v4/syncLifecycleController.js';
import { V4_FLUSH_REASON } from '../src/modules/storage-v4/syncScheduleModel.js';

function fakeTimerHarness(start = 0) {
  let currentTime = start;
  let sequence = 0;
  const tasks = new Map();
  return {
    now: () => currentTime,
    setTime(value) { currentTime = value; },
    setTimer(callback, delay) {
      sequence += 1;
      tasks.set(sequence, { callback, dueAt: currentTime + delay });
      return sequence;
    },
    clearTimer(handle) {
      tasks.delete(handle);
    },
    nextDueAt() {
      const due = Array.from(tasks.values()).map((task) => task.dueAt);
      return due.length ? Math.min(...due) : null;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('ediciones repetidas coalescen el timer de debounce sin escribir por tecla', () => {
  const timers = fakeTimerHarness(1000);
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: true, pending: 0, nextAttemptAt: null }),
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  controller.markDirty();
  assert.equal(timers.nextDueAt(), 4000);
  timers.setTime(2500);
  controller.markDirty();
  assert.equal(timers.nextDueAt(), 5500);
  assert.equal(controller.snapshot().dirtyGeneration, 2);
});

test('offline conserva cambios sin timer de red y reconnect agenda flush inmediato', () => {
  const timers = fakeTimerHarness(1000);
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: true, pending: 0, nextAttemptAt: null }),
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    online: false,
  });

  controller.markDirty();
  assert.equal(timers.nextDueAt(), null);
  timers.setTime(5000);
  controller.setOnline(true);
  assert.equal(timers.nextDueAt(), 5000);
  assert.equal(controller.snapshot().scheduled.reason, V4_FLUSH_REASON.RECONNECT);
});

test('background solicita flush inmediato pero no limpia cambios hasta confirmación', () => {
  const timers = fakeTimerHarness(1000);
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: true, pending: 0, nextAttemptAt: null }),
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  controller.markDirty();
  timers.setTime(1200);
  controller.setForeground(false);
  assert.equal(timers.nextDueAt(), 1200);
  assert.equal(controller.snapshot().scheduled.reason, V4_FLUSH_REASON.BACKGROUND);
  assert.notEqual(controller.snapshot().dirtySince, null);
});

test('resultado con backoff programa el siguiente intento sin loop inmediato', async () => {
  const timers = fakeTimerHarness(1000);
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: true, pending: 1, nextAttemptAt: 7000 }),
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  controller.markDirty();
  timers.setTime(2000);
  await controller.flushNow();
  assert.equal(controller.snapshot().notBefore, 7000);
  assert.equal(timers.nextDueAt(), 7000);
});

test('edición durante request en vuelo queda pendiente y genera follow-up', async () => {
  const timers = fakeTimerHarness(1000);
  const remote = deferred();
  const controller = createV4SyncLifecycleController({
    flush: () => remote.promise,
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  controller.markDirty();
  const inFlight = controller.flushNow();
  assert.equal(controller.snapshot().inFlight, true);

  timers.setTime(1100);
  controller.markDirty();
  assert.equal(controller.snapshot().dirtyGeneration, 2);

  timers.setTime(1200);
  remote.resolve({ leader: true, pending: 0, nextAttemptAt: null });
  await inFlight;

  assert.notEqual(controller.snapshot().dirtySince, null);
  assert.equal(controller.snapshot().scheduled.reason, V4_FLUSH_REASON.FOLLOW_UP);
  assert.equal(timers.nextDueAt(), 1200);
});

test('contexto que no es líder espera antes de volver a disputar el lease', async () => {
  const timers = fakeTimerHarness(1000);
  const controller = createV4SyncLifecycleController({
    flush: async () => ({ leader: false, pending: null, nextAttemptAt: null }),
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    nonLeaderRetryMs: 4000,
  });

  controller.markDirty();
  timers.setTime(1500);
  await controller.flushNow();
  assert.equal(controller.snapshot().notBefore, 5500);
  assert.equal(timers.nextDueAt(), 5500);
});

test('error inesperado se reporta, conserva dirty y aplica cooldown', async () => {
  const timers = fakeTimerHarness(1000);
  const reported = [];
  const controller = createV4SyncLifecycleController({
    flush: async () => { throw new Error('security/config failure'); },
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onError: (error) => reported.push(error.message),
    unexpectedErrorRetryMs: 10000,
  });

  controller.markDirty();
  timers.setTime(2000);
  const result = await controller.flushNow();
  assert.equal(result.error.message, 'security/config failure');
  assert.deepEqual(reported, ['security/config failure']);
  assert.notEqual(controller.snapshot().dirtySince, null);
  assert.equal(timers.nextDueAt(), 12000);
});

test('stop cancela scheduling y evita nuevas ejecuciones', async () => {
  const timers = fakeTimerHarness(1000);
  let flushes = 0;
  const controller = createV4SyncLifecycleController({
    flush: async () => {
      flushes += 1;
      return { leader: true, pending: 0, nextAttemptAt: null };
    },
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  controller.markDirty();
  controller.stop();
  assert.equal(timers.nextDueAt(), null);
  assert.equal(controller.snapshot().stopped, true);
  await controller.saveNow();
  assert.equal(flushes, 0);
});
