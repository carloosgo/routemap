import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createV4SyncRuntime } from '../src/modules/storage-v4/syncRuntime.js';

function fakeTimerHarness(start = 1000) {
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
    clearTimer(handle) { tasks.delete(handle); },
    nextDueAt() {
      const values = Array.from(tasks.values()).map((item) => item.dueAt);
      return values.length ? Math.min(...values) : null;
    },
  };
}

function createNotifierBus() {
  const listeners = new Set();
  const messages = [];
  return {
    messages,
    notifier: {
      publish(type, payload) {
        const message = { type, payload };
        messages.push(message);
        for (const listener of listeners) listener(message);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

function createIntent(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: { id: 'segment-1', note: 'local' },
    ...overrides,
  };
}

function createRuntimeHarness({ store, timers, notifier = null, flush } = {}) {
  return createV4SyncRuntime({
    userId: 'alice',
    localPersistence: store,
    syncCoordinator: {
      flush: flush || (async () => ({
        leader: true,
        attempted: 0,
        synced: 0,
        retried: 0,
        conflicts: 0,
        pending: 0,
        nextAttemptAt: null,
      })),
    },
    crossContextNotifier: notifier,
    now: timers.now,
    lifecycleOptions: {
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    },
  });
}

test('commitIntent persiste primero y luego agenda sync sin escribir por campo', async () => {
  const store = createMemoryV4LocalPersistence();
  const timers = fakeTimerHarness();
  const bus = createNotifierBus();
  const runtime = createRuntimeHarness({ store, timers, notifier: bus.notifier });

  const result = await runtime.commitIntent(createIntent());
  assert.equal(result.entity.localRevision, 1);
  assert.equal((await store.listMutations({ userId: 'alice' })).length, 1);
  assert.equal(runtime.snapshot().dirtyGeneration, 1);
  assert.equal(timers.nextDueAt(), 4000);
  assert.equal(bus.messages.length, 1);
  assert.equal(bus.messages[0].payload.entityKey, 'alice/trip-1/segment/segment-1');
});

test('recoverPending reactiva una cola durable después de recrear el runtime', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.commitLocalIntent({ intent: createIntent(), nowMs: 500 });
  const timers = fakeTimerHarness(1000);
  const runtime = createRuntimeHarness({ store, timers });

  assert.equal(await runtime.recoverPending(), 1);
  assert.notEqual(runtime.snapshot().dirtySince, null);
  assert.equal(timers.nextDueAt(), 4000);
});

test('notificación de otra pestaña despierta scheduling para el mismo usuario', () => {
  const store = createMemoryV4LocalPersistence();
  const timers = fakeTimerHarness(1000);
  const bus = createNotifierBus();
  const runtime = createRuntimeHarness({ store, timers, notifier: bus.notifier });

  bus.notifier.publish('v4-mutation-dirty', {
    userId: 'alice',
    tripId: 'trip-2',
    entityKey: 'alice/trip-2/note/note-1',
  });
  assert.notEqual(runtime.snapshot().dirtySince, null);
  assert.equal(timers.nextDueAt(), 4000);
});

test('notificación de otro usuario no contamina el runtime actual', () => {
  const store = createMemoryV4LocalPersistence();
  const timers = fakeTimerHarness(1000);
  const bus = createNotifierBus();
  const runtime = createRuntimeHarness({ store, timers, notifier: bus.notifier });

  bus.notifier.publish('v4-mutation-dirty', {
    userId: 'bob',
    tripId: 'trip-x',
  });
  assert.equal(runtime.snapshot().dirtySince, null);
  assert.equal(timers.nextDueAt(), null);
});

test('saveNow delega al coordinador y limpia scheduling cuando no queda cola', async () => {
  const store = createMemoryV4LocalPersistence();
  const timers = fakeTimerHarness(1000);
  let calls = 0;
  const runtime = createRuntimeHarness({
    store,
    timers,
    flush: async () => {
      calls += 1;
      return {
        leader: true,
        attempted: 1,
        synced: 1,
        retried: 0,
        conflicts: 0,
        pending: 0,
        nextAttemptAt: null,
      };
    },
  });

  await runtime.commitIntent(createIntent());
  await runtime.saveNow();
  assert.equal(calls, 1);
  assert.equal(runtime.snapshot().dirtySince, null);
  assert.equal(timers.nextDueAt(), null);
});

test('runtime rechaza intención de otro usuario antes de tocar almacenamiento local', async () => {
  const store = createMemoryV4LocalPersistence();
  const timers = fakeTimerHarness();
  const runtime = createRuntimeHarness({ store, timers });

  await assert.rejects(
    runtime.commitIntent(createIntent({ userId: 'bob' })),
    /no pertenece al usuario/
  );
  assert.equal((await store.listMutations({ userId: 'alice' })).length, 0);
});

test('stop impide nuevas ediciones a través del runtime', async () => {
  const store = createMemoryV4LocalPersistence();
  const timers = fakeTimerHarness();
  const runtime = createRuntimeHarness({ store, timers });
  runtime.stop();

  await assert.rejects(runtime.commitIntent(createIntent()), /está detenido/);
  assert.equal(timers.nextDueAt(), null);
});
