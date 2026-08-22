import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createGateGRolloutTelemetryEmitter } from '../src/infrastructure/firebase/gateGRolloutTelemetryClient.js';

test('Gate G telemetry agrupa eventos y nunca propaga fallos del sink', async () => {
  const sent = [];
  const emitter = createGateGRolloutTelemetryEmitter({
    batchSize: 2,
    maxBufferedEvents: 4,
    flushDelayMs: 60_000,
    schedule: () => 1,
    cancel: () => {},
    sendBatch: async (events) => {
      sent.push(events);
      throw new Error('sink down');
    },
  });

  emitter.emit({ operation: 'list' });
  emitter.emit({ operation: 'get' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 2);
  assert.equal(emitter.pendingCount(), 0);
  emitter.stop();
});

test('Gate G telemetry limita memoria descartando el evento más antiguo', async () => {
  const sent = [];
  const emitter = createGateGRolloutTelemetryEmitter({
    batchSize: 4,
    maxBufferedEvents: 4,
    flushDelayMs: 60_000,
    schedule: () => 1,
    cancel: () => {},
    sendBatch: async (events) => sent.push(events),
  });

  emitter.emit({ n: 1 });
  emitter.emit({ n: 2 });
  emitter.emit({ n: 3 });
  emitter.emit({ n: 4 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].map((event) => event.n), [1, 2, 3, 4]);
  emitter.stop();
});

test('Gate G telemetry flush manual envía lotes pendientes', async () => {
  const sent = [];
  const emitter = createGateGRolloutTelemetryEmitter({
    batchSize: 10,
    maxBufferedEvents: 20,
    flushDelayMs: 60_000,
    schedule: () => 1,
    cancel: () => {},
    sendBatch: async (events) => sent.push(events),
  });

  emitter.emit({ operation: 'list' });
  emitter.emit({ operation: 'get' });
  assert.equal(emitter.pendingCount(), 2);
  assert.equal(await emitter.flush(), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 2);
  emitter.stop();
});
