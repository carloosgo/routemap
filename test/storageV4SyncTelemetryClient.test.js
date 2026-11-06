import test from 'node:test';
import assert from 'node:assert/strict';
import { createV4SyncTelemetryEmitter } from '../src/infrastructure/firebase/v4SyncTelemetryClient.js';

function schedulerHarness() {
  let sequence = 0;
  const tasks = new Map();
  return {
    schedule(fn) {
      sequence += 1;
      tasks.set(sequence, fn);
      return sequence;
    },
    cancel(id) { tasks.delete(id); },
    runAll() {
      const pending = Array.from(tasks.values());
      tasks.clear();
      pending.forEach((fn) => fn());
    },
  };
}

test('sync telemetry client agrupa y envía sin bloquear al productor', async () => {
  const sent = [];
  const emitter = createV4SyncTelemetryEmitter({
    sendBatch: async (events) => sent.push(events),
    batchSize: 2,
    maxBufferedEvents: 4,
    flushDelayMs: 10,
  });

  emitter.emit({ event: 'queue-recovery', pending: 1, oldestPendingAgeMs: 5 });
  emitter.emit({ event: 'flush', outcome: 'success', reason: 'save-now', durationMs: 2, pending: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 2);
  emitter.stop();
});

test('sync telemetry client descarta el evento más antiguo al saturarse', async () => {
  const sent = [];
  const scheduler = schedulerHarness();
  const emitter = createV4SyncTelemetryEmitter({
    sendBatch: async (events) => sent.push(events),
    batchSize: 3,
    maxBufferedEvents: 3,
    flushDelayMs: 100,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  emitter.emit({ event: 'queue-recovery', pending: 1, oldestPendingAgeMs: 1 });
  emitter.emit({ event: 'queue-recovery', pending: 2, oldestPendingAgeMs: 2 });
  emitter.emit({ event: 'queue-recovery', pending: 3, oldestPendingAgeMs: 3 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].map((event) => event.pending), [1, 2, 3]);
  emitter.stop();
});

test('fallo de telemetría es silencioso y no relanza', async () => {
  const emitter = createV4SyncTelemetryEmitter({
    sendBatch: async () => { throw new Error('telemetry unavailable'); },
    batchSize: 1,
    maxBufferedEvents: 2,
  });

  emitter.emit({ event: 'queue-recovery', pending: 1, oldestPendingAgeMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(emitter.pendingCount(), 0);
  emitter.stop();
});
