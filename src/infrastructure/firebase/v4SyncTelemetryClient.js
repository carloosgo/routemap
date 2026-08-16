import { firebaseCallable } from './callableFunctions.js';

const FUNCTION_NAME = 'storageV4SyncTelemetry';

async function defaultSendBatch(events) {
  await firebaseCallable(FUNCTION_NAME, { events });
}

export function createV4SyncTelemetryEmitter({
  sendBatch = defaultSendBatch,
  batchSize = 10,
  maxBufferedEvents = 50,
  flushDelayMs = 5_000,
  schedule = (fn, delay) => setTimeout(fn, delay),
  cancel = (id) => clearTimeout(id),
} = {}) {
  if (typeof sendBatch !== 'function') throw new TypeError('sendBatch debe ser función.');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('batchSize inválido.');
  if (!Number.isInteger(maxBufferedEvents) || maxBufferedEvents < batchSize) {
    throw new TypeError('maxBufferedEvents inválido.');
  }
  if (!Number.isFinite(flushDelayMs) || flushDelayMs < 0) {
    throw new TypeError('flushDelayMs inválido.');
  }

  let buffer = [];
  let timer = null;
  let flushing = false;
  let stopped = false;

  function clearScheduledFlush() {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  }

  function scheduleFlush() {
    if (stopped || timer !== null || buffer.length === 0) return;
    timer = schedule(() => {
      timer = null;
      void flush();
    }, flushDelayMs);
  }

  async function flush() {
    if (stopped || flushing || buffer.length === 0) return false;
    flushing = true;
    clearScheduledFlush();
    const batch = buffer.splice(0, batchSize);
    try {
      await sendBatch(batch);
      return true;
    } catch {
      return false;
    } finally {
      flushing = false;
      if (!stopped && buffer.length > 0) scheduleFlush();
    }
  }

  function emit(event) {
    if (stopped || !event || typeof event !== 'object' || Array.isArray(event)) return;
    if (buffer.length >= maxBufferedEvents) buffer.shift();
    buffer.push({ ...event });

    if (buffer.length >= batchSize) {
      clearScheduledFlush();
      void flush();
      return;
    }
    scheduleFlush();
  }

  function stop() {
    stopped = true;
    clearScheduledFlush();
    buffer = [];
  }

  return {
    emit,
    flush,
    stop,
    pendingCount: () => buffer.length,
  };
}
