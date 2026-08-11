const OPERATIONS = new Set(['list', 'get', 'save', 'remove']);
const REPOSITORY_MODES = new Set(['v3', 'hybrid-read']);
const OUTCOMES = new Set(['success', 'error']);
const RESULT_SCHEMAS = new Set(['none', 'legacy', 'v4']);
const ALLOWED_KEYS = new Set([
  'operation',
  'repositoryMode',
  'outcome',
  'durationMs',
  'resultCount',
  'v4Count',
  'legacyCount',
  'found',
  'resultSchema',
  'errorCode',
]);

function requiredEnum(value, allowed, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!allowed.has(normalized)) throw new TypeError(`${field} inválido.`);
  return normalized;
}

function boundedInteger(value, field, max = 100_000) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    throw new TypeError(`${field} inválido.`);
  }
  return Math.trunc(number);
}

function optionalCount(event, key) {
  return event[key] === undefined ? undefined : boundedInteger(event[key], key, 10_000);
}

function optionalErrorCode(value) {
  if (value === undefined || value === '') return '';
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_./:-]{1,80}$/.test(normalized)) {
    throw new TypeError('errorCode inválido.');
  }
  return normalized;
}

export function sanitizeRolloutTelemetryEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Evento de telemetría inválido.');
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) throw new TypeError(`Campo de telemetría no permitido: ${key}.`);
  }

  const event = {
    operation: requiredEnum(raw.operation, OPERATIONS, 'operation'),
    repositoryMode: requiredEnum(raw.repositoryMode, REPOSITORY_MODES, 'repositoryMode'),
    outcome: requiredEnum(raw.outcome, OUTCOMES, 'outcome'),
    durationMs: boundedInteger(raw.durationMs, 'durationMs', 120_000),
  };

  for (const key of ['resultCount', 'v4Count', 'legacyCount']) {
    const value = optionalCount(raw, key);
    if (value !== undefined) event[key] = value;
  }
  if (raw.found !== undefined) {
    if (typeof raw.found !== 'boolean') throw new TypeError('found inválido.');
    event.found = raw.found;
  }
  if (raw.resultSchema !== undefined) {
    event.resultSchema = requiredEnum(raw.resultSchema, RESULT_SCHEMAS, 'resultSchema');
  }
  const errorCode = optionalErrorCode(raw.errorCode);
  if (errorCode) event.errorCode = errorCode;

  return event;
}

export function sanitizeRolloutTelemetryBatch(rawEvents, { maxEvents = 20 } = {}) {
  if (!Array.isArray(rawEvents) || rawEvents.length < 1 || rawEvents.length > maxEvents) {
    throw new TypeError('Lote de telemetría inválido.');
  }
  return rawEvents.map(sanitizeRolloutTelemetryEvent);
}
