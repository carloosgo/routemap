import { GATE_G_REMOTE_KEYS } from '../src/modules/storage-v4/gateGRuntimeConfigModel.js';

const READINESS_FIELDS = Object.freeze([
  'readRulesReady',
  'writeRulesReady',
  'syncReady',
  'aggregateReady',
  'touchReady',
  'lifecycleReady',
  'purgeReady',
]);

export const STORAGE_V4_REMOTE_KEYS = Object.freeze([
  GATE_G_REMOTE_KEYS.enabled,
  GATE_G_REMOTE_KEYS.killSwitch,
  GATE_G_REMOTE_KEYS.mode,
  GATE_G_REMOTE_KEYS.cohortPercent,
  ...READINESS_FIELDS.map((field) => GATE_G_REMOTE_KEYS[field]),
]);

function clone(value) {
  return value == null ? value : globalThis.structuredClone(value);
}

function templateParameters(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new TypeError('Remote Config template debe ser un objeto.');
  }
  if (template.parameters == null) return {};
  if (typeof template.parameters !== 'object' || Array.isArray(template.parameters)) {
    throw new TypeError('Remote Config parameters debe ser un objeto.');
  }
  return template.parameters;
}

function assertNoConditionalOverrides(parameters) {
  for (const key of STORAGE_V4_REMOTE_KEYS) {
    const conditionalValues = parameters[key]?.conditionalValues;
    if (
      conditionalValues
      && typeof conditionalValues === 'object'
      && Object.keys(conditionalValues).length > 0
    ) {
      throw new Error(`Remote Config ${key} tiene conditionalValues; rollout v4 falla cerrado.`);
    }
  }
}

function setDefault(parameters, key, value) {
  const current = parameters[key];
  if (current != null && (typeof current !== 'object' || Array.isArray(current))) {
    throw new TypeError(`Remote Config ${key} tiene formato inválido.`);
  }
  parameters[key] = {
    ...(current || {}),
    defaultValue: { value: String(value) },
    description: current?.description || 'Atlas Storage v4 rollout control',
  };
}

function defaultLiteral(parameters, key) {
  const defaultValue = parameters[key]?.defaultValue;
  return typeof defaultValue?.value === 'string' ? defaultValue.value : null;
}

function baseTemplate(template) {
  const next = clone(template);
  const parameters = clone(templateParameters(next));
  assertNoConditionalOverrides(parameters);
  next.parameters = parameters;
  return { next, parameters };
}

export function buildStorageV4ReadinessTemplate(template) {
  const { next, parameters } = baseTemplate(template);
  setDefault(parameters, GATE_G_REMOTE_KEYS.enabled, 'false');
  setDefault(parameters, GATE_G_REMOTE_KEYS.killSwitch, 'true');
  setDefault(parameters, GATE_G_REMOTE_KEYS.mode, 'off');
  setDefault(parameters, GATE_G_REMOTE_KEYS.cohortPercent, '0');
  for (const field of READINESS_FIELDS) {
    setDefault(parameters, GATE_G_REMOTE_KEYS[field], 'true');
  }
  return next;
}

function assertReadiness(parameters) {
  for (const field of READINESS_FIELDS) {
    const key = GATE_G_REMOTE_KEYS[field];
    if (defaultLiteral(parameters, key) !== 'true') {
      throw new Error(`Remote Config ${key} debe estar true antes de activar PILOT.`);
    }
  }
}

function normalizeExplicitPercent(value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100) {
    throw new TypeError('cohortPercent debe ser explícito y estar en (0, 100].');
  }
  return String(number);
}

export function buildStorageV4PilotActivationTemplate(template, { cohortPercent } = {}) {
  const { next, parameters } = baseTemplate(template);
  assertReadiness(parameters);
  const percent = normalizeExplicitPercent(cohortPercent);
  setDefault(parameters, GATE_G_REMOTE_KEYS.enabled, 'true');
  setDefault(parameters, GATE_G_REMOTE_KEYS.killSwitch, 'false');
  setDefault(parameters, GATE_G_REMOTE_KEYS.mode, 'pilot');
  setDefault(parameters, GATE_G_REMOTE_KEYS.cohortPercent, percent);
  return next;
}

export function buildStorageV4KillSwitchTemplate(template) {
  const { next, parameters } = baseTemplate(template);
  setDefault(parameters, GATE_G_REMOTE_KEYS.enabled, 'false');
  setDefault(parameters, GATE_G_REMOTE_KEYS.killSwitch, 'true');
  setDefault(parameters, GATE_G_REMOTE_KEYS.mode, 'off');
  setDefault(parameters, GATE_G_REMOTE_KEYS.cohortPercent, '0');
  return next;
}

export function summarizeStorageV4RemoteConfig(template) {
  const parameters = templateParameters(template);
  assertNoConditionalOverrides(parameters);
  return Object.freeze({
    enabled: defaultLiteral(parameters, GATE_G_REMOTE_KEYS.enabled),
    killSwitch: defaultLiteral(parameters, GATE_G_REMOTE_KEYS.killSwitch),
    mode: defaultLiteral(parameters, GATE_G_REMOTE_KEYS.mode),
    cohortPercent: defaultLiteral(parameters, GATE_G_REMOTE_KEYS.cohortPercent),
    readiness: Object.freeze(Object.fromEntries(
      READINESS_FIELDS.map((field) => [field, defaultLiteral(parameters, GATE_G_REMOTE_KEYS[field])])
    )),
  });
}
