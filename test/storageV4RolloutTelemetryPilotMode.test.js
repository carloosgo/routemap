import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeRolloutTelemetryEvent,
} from '../functions/v4RolloutTelemetryModel.js';

test('backend acepta telemetría del repositorio v4-pilot', () => {
  assert.deepEqual(
    sanitizeRolloutTelemetryEvent({
      operation: 'list',
      repositoryMode: 'v4-pilot',
      outcome: 'success',
      durationMs: 12,
      resultCount: 0,
      v4Count: 0,
      legacyCount: 0,
    }),
    {
      operation: 'list',
      repositoryMode: 'v4-pilot',
      outcome: 'success',
      durationMs: 12,
      resultCount: 0,
      v4Count: 0,
      legacyCount: 0,
    }
  );
});

test('backend sigue rechazando modos de repositorio desconocidos', () => {
  assert.throws(
    () => sanitizeRolloutTelemetryEvent({
      operation: 'list',
      repositoryMode: 'future-mode',
      outcome: 'success',
      durationMs: 1,
    }),
    /repositoryMode inválido/
  );
});
