import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrossContextNotifier } from '../src/modules/storage-v4/crossContextNotifier.js';

class FakeBroadcastChannel {
  static channels = new Map();

  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    if (!FakeBroadcastChannel.channels.has(name)) {
      FakeBroadcastChannel.channels.set(name, new Set());
    }
    FakeBroadcastChannel.channels.get(name).add(this);
  }

  addEventListener(type, listener) {
    if (type === 'message') this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === 'message') this.listeners.delete(listener);
  }

  postMessage(data) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) || []) {
      queueMicrotask(() => channel.listeners.forEach((listener) => listener({ data })));
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
    this.listeners.clear();
  }
}

test('pestañas reciben avisos ajenos y nunca sus propios mensajes', async () => {
  FakeBroadcastChannel.channels.clear();
  const tabA = createCrossContextNotifier({
    contextId: 'tab-a',
    BroadcastChannelImpl: FakeBroadcastChannel,
  });
  const tabB = createCrossContextNotifier({
    contextId: 'tab-b',
    BroadcastChannelImpl: FakeBroadcastChannel,
  });
  const receivedA = [];
  const receivedB = [];
  tabA.subscribe((message) => receivedA.push(message));
  tabB.subscribe((message) => receivedB.push(message));

  tabA.publish('mutation-added', { mutationId: 'm1' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(receivedA.length, 0);
  assert.equal(receivedB.length, 1);
  assert.equal(receivedB[0].type, 'mutation-added');
  assert.deepEqual(receivedB[0].payload, { mutationId: 'm1' });
  assert.equal(receivedB[0].sourceContextId, 'tab-a');

  tabA.close();
  tabB.close();
});

test('si BroadcastChannel no existe el adaptador degrada sin romper persistencia local', () => {
  const notifier = createCrossContextNotifier({
    contextId: 'tab-a',
    BroadcastChannelImpl: null,
  });
  assert.equal(notifier.available, false);
  assert.doesNotThrow(() => notifier.publish('mutation-added'));
  const unsubscribe = notifier.subscribe(() => {});
  assert.equal(typeof unsubscribe, 'function');
  notifier.close();
});
