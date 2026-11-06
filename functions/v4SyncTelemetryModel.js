const EVENTS = new Set(['flush', 'queue-recovery']);
const FLUSH_OUTCOMES = new Set(['success', 'not-leader', 'unexpected-error']);
const FLUSH_REASONS = new Set([
  'debounce',
  'max-dirty-age',
  'reconnect',
  'background',
  'foreground',
  'save-now',
  'follow-up',
]);
const ALLOWED_KEYS = new Set([
  'event',
  'outcome',
  'reason',
  'durationMs',
  'pending',
  'attempted',
  'synced',
  'retried',
  'conflicts',
  'retryScheduled',
  'oldestPendingAgeMs',
  'errorName',
  'errorCode',
]);

function requiredEnum(value, allowed, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!allowed.has(normalized)) throw new TypeError(`${field} inválido.`);
  return normalized;
}

function boundedInteger(value, field, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    throw new TypeError(`${field} inválido.`);
  }
  return Math.trunc(number);
}

function optionalCount(raw, key) {
  if (raw[key] === undefined) return undefined;
  if (raw[key] === null && key === 'pending') return null;
  return boundedInteger(raw[key], key, 100_000);
}

function optionalBoolean(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${field} inválido.`);
  return value;
}

function optionalSafeToken(value, field, max = 80) {
  if (value === undefined || value === '') return '';
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max || !/^[A-Za-z0-9_./:-]+$/.test(normalized)) {
    throw new TypeError(`${field} inválido.`);
  }
  return normalized;
}

function sanitizeFlush(raw) {
  const event = {
    event: 'flush',
    outcome: requiredEnum(raw.outcome, FLUSH_OUTCOMES, 'outcome'),
    reason: requiredEnum(raw.reason, FLUSH_REASONS, 'reason'),
    durationMs: boundedInteger(raw.durationMs, 'durationMs', 120_000),
  };

  for (const key of ['pending', 'attempted', 'synced', 'retried', 'conflicts']) {
    const value = optionalCount(raw, key);
    if (value !== undefined) event[key] = value;
  }

  const retryScheduled = optionalBoolean(raw.retryScheduled, 'retryScheduled');
  if (retryScheduled !== undefined) event.retryScheduled = retryScheduled;

  const errorName = optionalSafeToken(raw.errorName, 'errorName');
  if (errorName) event.errorName = errorName;
  const errorCode = optionalSafeToken(raw.errorCode, 'errorCode');
  if (errorCode) event.errorCode = errorCode;

  return event;
}

function sanitizeQueueRecovery(raw) {
  return {
    event: 'queue-recovery',
    pending: boundedInteger(raw.pending, 'pending', 100_000),
    oldestPendingAgeMs: boundedInteger(
      raw.oldestPendingAgeMs,
      'oldestPendingAgeMs',
      90 * 24 * 60 * 60 * 1000
    ),
  };
}

export function sanitizeSyncTelemetryEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Evento de telemetría inválido.');
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) throw new TypeError(`Campo de telemetría no permitido: ${key}.`);
  }

  const eventType = requiredEnum(raw.event, EVENTS, 'event');
  return eventType === 'flush' ? sanitizeFlush(raw) : sanitizeQueueRecovery(raw);
}

export function sanitizeSyncTelemetryBatch(rawEvents, { maxEvents = 20 } = {}) {
  if (!Array.isArray(rawEvents) || rawEvents.length < 1 || rawEvents.length > maxEvents) {
    throw new TypeError('Lote de telemetría inválido.');
  }
  return rawEvents.map(sanitizeSyncTelemetryEvent);
}
