import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachV4WebSyncLifecycle } from '../src/modules/storage-v4/webSyncLifecycleBridge.js';

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener({ type });
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

function runtimeHarness({ recoverError = null } = {}) {
  const calls = [];
  return {
    calls,
    runtime: {
      async recoverPending() {
        calls.push(['recover']);
        if (recoverError) throw recoverError;
        return 0;
      },
      setOnline(value) { calls.push(['online', value]); },
      setForeground(value) { calls.push(['foreground', value]); },
    },
  };
}

test('bridge inicializa conectividad, visibilidad y recuperación durable', async () => {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget({ visibilityState: 'visible' });
  const navigatorTarget = { onLine: true };
  const harness = runtimeHarness();

  const bridge = attachV4WebSyncLifecycle({
    runtime: harness.runtime,
    windowTarget,
    documentTarget,
    navigatorTarget,
  });
  await Promise.resolve();

  assert.deepEqual(harness.calls.slice(0, 3), [
    ['online', true],
    ['foreground', true],
    ['recover'],
  ]);
  assert.equal(windowTarget.listenerCount('online'), 1);
  assert.equal(documentTarget.listenerCount('visibilitychange'), 1);
  bridge.detach();
});

test('online/offline y visibilitychange actualizan solo el runtime', () => {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget({ visibilityState: 'visible' });
  const navigatorTarget = { onLine: true };
  const harness = runtimeHarness();
  attachV4WebSyncLifecycle({
    runtime: harness.runtime,
    windowTarget,
    documentTarget,
    navigatorTarget,
  });
  harness.calls.length = 0;

  windowTarget.dispatch('offline');
  windowTarget.dispatch('online');
  documentTarget.visibilityState = 'hidden';
  documentTarget.dispatch('visibilitychange');
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatch('visibilitychange');

  assert.deepEqual(harness.calls, [
    ['online', false],
    ['online', true],
    ['foreground', false],
    ['foreground', true],
  ]);
});

test('pagehide es best-effort background y pageshow rehidrata estado observable', () => {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget({ visibilityState: 'visible' });
  const navigatorTarget = { onLine: true };
  const harness = runtimeHarness();
  attachV4WebSyncLifecycle({
    runtime: harness.runtime,
    windowTarget,
    documentTarget,
    navigatorTarget,
  });
  harness.calls.length = 0;

  windowTarget.dispatch('pagehide');
  navigatorTarget.onLine = false;
  documentTarget.visibilityState = 'hidden';
  windowTarget.dispatch('pageshow');

  assert.deepEqual(harness.calls, [
    ['foreground', false],
    ['online', false],
    ['foreground', false],
  ]);
});

test('detach elimina todos los listeners y es idempotente', () => {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget({ visibilityState: 'visible' });
  const harness = runtimeHarness();
  const bridge = attachV4WebSyncLifecycle({
    runtime: harness.runtime,
    windowTarget,
    documentTarget,
    navigatorTarget: { onLine: true },
  });

  bridge.detach();
  bridge.detach();
  assert.equal(windowTarget.listenerCount('online'), 0);
  assert.equal(windowTarget.listenerCount('offline'), 0);
  assert.equal(windowTarget.listenerCount('pagehide'), 0);
  assert.equal(windowTarget.listenerCount('pageshow'), 0);
  assert.equal(documentTarget.listenerCount('visibilitychange'), 0);
});

test('fallo al recuperar cola se reporta sin romper el attach', async () => {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget({ visibilityState: 'visible' });
  const harness = runtimeHarness({ recoverError: new Error('indexeddb unavailable') });
  const errors = [];

  attachV4WebSyncLifecycle({
    runtime: harness.runtime,
    windowTarget,
    documentTarget,
    navigatorTarget: { onLine: true },
    onError: (error) => errors.push(error.message),
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(errors, ['indexeddb unavailable']);
});

test('bridge no depende de beforeunload ni de una escritura de red al cerrar', async () => {
  const source = await readFile(
    new URL('../src/modules/storage-v4/webSyncLifecycleBridge.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /beforeunload|sendBeacon/);
  assert.match(source, /pagehide/);
  assert.match(source, /recoverPending/);
});
