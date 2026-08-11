import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeRolloutTelemetryBatch,
  sanitizeRolloutTelemetryEvent,
} from './v4RolloutTelemetryModel.js';

test('telemetría Gate G acepta solo métricas agregadas permitidas', () => {
  assert.deepEqual(sanitizeRolloutTelemetryEvent({
    operation: 'list',
    repositoryMode: 'hybrid-read',
    outcome: 'success',
    durationMs: 42.9,
    resultCount: 4,
    v4Count: 1,
    legacyCount: 3,
  }), {
    operation: 'list',
    repositoryMode: 'hybrid-read',
    outcome: 'success',
    durationMs: 42,
    resultCount: 4,
    v4Count: 1,
    legacyCount: 3,
  });
});

test('telemetría Gate G rechaza IDs, nombres y payloads desconocidos', () => {
  for (const forbidden of ['tripId', 'uid', 'name', 'payload', 'text']) {
    assert.throws(() => sanitizeRolloutTelemetryEvent({
      operation: 'get',
      repositoryMode: 'v3',
      outcome: 'success',
      durationMs: 10,
      [forbidden]: 'secret',
    }), /no permitido/);
  }
});

test('telemetría Gate G valida enums, latencia y códigos de error', () => {
  assert.throws(() => sanitizeRolloutTelemetryEvent({
    operation: 'hack',
    repositoryMode: 'v3',
    outcome: 'success',
    durationMs: 1,
  }));
  assert.throws(() => sanitizeRolloutTelemetryEvent({
    operation: 'get',
    repositoryMode: 'v3',
    outcome: 'error',
    durationMs: 1,
    errorCode: 'contenido con espacios y datos libres',
  }));
});

test('telemetría Gate G limita lotes', () => {
  const event = {
    operation: 'save',
    repositoryMode: 'v3',
    outcome: 'success',
    durationMs: 25,
  };
  assert.equal(sanitizeRolloutTelemetryBatch([event, event]).length, 2);
  assert.throws(() => sanitizeRolloutTelemetryBatch([]));
  assert.throws(() => sanitizeRolloutTelemetryBatch(Array.from({ length: 21 }, () => event)));
});
