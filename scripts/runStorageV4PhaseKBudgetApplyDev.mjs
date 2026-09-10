/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';

const PROJECT = 'atlasmap-dev';
const DEFAULT_DISPLAY_NAME = 'Atlas Storage v4 dev';
const CONFIRM = 'CREATE-ATLAS-V4-PHASE-K-BUDGET-DEV';

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function argValue(name) {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function parsePositiveAmount(raw) {
  if (!raw) fail('Falta --amount. No existe un monto default deliberadamente.', 2);
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) fail('--amount debe ser un decimal positivo.', 2);
  const [whole, fraction = ''] = raw.split('.');
  const units = BigInt(whole);
  const nanos = Number((fraction + '000000000').slice(0, 9));
  if (units === 0n && nanos === 0) fail('--amount debe ser mayor que cero.', 2);
  return { units: units.toString(), nanos };
}

function parseThresholds(raw) {
  if (!raw) fail('Falta --thresholds. No existen thresholds default deliberadamente.', 2);
  const values = raw.split(',').map((value) => Number(value.trim()));
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0 || value > 2)) {
    fail('--thresholds debe contener porcentajes decimales > 0 y <= 2.', 2);
  }
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length !== values.length) fail('--thresholds no debe contener valores duplicados.', 2);
  return unique;
}

function parseDisplayName(raw) {
  const value = (raw || DEFAULT_DISPLAY_NAME).trim();
  if (!value) fail('--display-name no puede quedar vacío.', 2);
  if (value.length > 60) fail('--display-name no puede exceder 60 caracteres.', 2);
  return value;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const known = args.filter((arg) =>
    arg === '--apply' ||
    arg.startsWith('--amount=') ||
    arg.startsWith('--thresholds=') ||
    arg.startsWith('--display-name=') ||
    arg.startsWith('--confirm=')
  );
  if (known.length !== args.length) fail('Hay argumentos no reconocidos.', 2);
  const apply = args.includes('--apply');
  if (apply && argValue('--confirm') !== CONFIRM) {
    fail(`Para crear el budget se exige --confirm=${CONFIRM}.`, 2);
  }
  return {
    apply,
    amount: parsePositiveAmount(argValue('--amount')),
    thresholds: parseThresholds(argValue('--thresholds')),
    displayName: parseDisplayName(argValue('--display-name')),
  };
}

function gcloudCandidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const candidates = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.unshift(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', executable, ...args], options);
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of gcloudCandidates()) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runGcloud(gcloud, args) {
  const result = runProcess(gcloud, args);
  if (result.error) fail(`No se pudo ejecutar gcloud: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    fail(`gcloud falló: ${detail || args.join(' ')}`);
  }
  return String(result.stdout || '').trim();
}

async function requestJson(url, { token, method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function listProjectBudgets(token, billingAccountName) {
  const budgets = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ scope: `projects/${PROJECT}`, pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await requestJson(
      `https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets?${params}`,
      { token }
    );
    budgets.push(...(Array.isArray(response?.budgets) ? response.budgets : []));
    pageToken = typeof response?.nextPageToken === 'string' ? response.nextPageToken : '';
  } while (pageToken);
  return budgets;
}

async function testCreatePermission(token, billingAccountName) {
  const response = await requestJson(
    `https://cloudbilling.googleapis.com/v1/${billingAccountName}:testIamPermissions`,
    {
      token,
      method: 'POST',
      body: { permissions: ['billing.budgets.create', 'billing.budgets.list'] },
    }
  );
  const permissions = Array.isArray(response?.permissions) ? response.permissions : [];
  return {
    create: permissions.includes('billing.budgets.create'),
    list: permissions.includes('billing.budgets.list'),
  };
}

function normalizeMoney(value) {
  return {
    units: String(value?.units || '0'),
    nanos: Number(value?.nanos || 0),
  };
}

function normalizedThresholds(budget) {
  return (Array.isArray(budget?.thresholdRules) ? budget.thresholdRules : [])
    .map((rule) => Number(rule?.thresholdPercent))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function budgetMatches(budget, desired) {
  return (
    budget?.displayName === desired.displayName &&
    JSON.stringify(normalizeMoney(budget?.amount?.specifiedAmount)) === JSON.stringify(desired.amount) &&
    JSON.stringify(normalizedThresholds(budget)) === JSON.stringify(desired.thresholds)
  );
}

const args = parseArgs();
const desired = {
  displayName: args.displayName,
  amount: args.amount,
  thresholds: args.thresholds,
};
const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontró una instalación utilizable de gcloud.');
const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
const billingRaw = runGcloud(gcloud, ['billing', 'projects', 'describe', PROJECT, '--format=json']);
let billing;
try {
  billing = JSON.parse(billingRaw);
} catch {
  fail('No se pudo interpretar el estado de billing del proyecto.');
}
if (billing?.billingEnabled !== true) fail('Billing no está habilitado para atlasmap-dev.');
const billingAccountName = typeof billing?.billingAccountName === 'string' ? billing.billingAccountName : '';
if (!/^billingAccounts\/[A-Z0-9-]+$/i.test(billingAccountName)) {
  fail('No se pudo resolver una billing account válida para atlasmap-dev.');
}
const token = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!token) fail('No se pudo obtener un access token de gcloud.');

let permissions;
let existing;
try {
  [permissions, existing] = await Promise.all([
    testCreatePermission(token, billingAccountName),
    listProjectBudgets(token, billingAccountName),
  ]);
} catch (error) {
  fail(`No se pudo completar el preflight de budget: ${error.message}`);
}

const exactMatches = existing.filter((budget) => budgetMatches(budget, desired));
const conflicting = existing.filter((budget) => !budgetMatches(budget, desired));

console.log(JSON.stringify({
  project: PROJECT,
  applyRequested: args.apply,
  billingEnabled: true,
  billingAccountResolved: true,
  billingAccountIdExposed: false,
  permissions,
  projectScopedBudgetCount: existing.length,
  exactMatchCount: exactMatches.length,
  conflictingBudgetCount: conflicting.length,
  desired: {
    displayName: desired.displayName,
    specifiedAmount: desired.amount,
    thresholds: desired.thresholds,
    calendarPeriod: 'MONTH',
    projectScope: `projects/${PROJECT}`,
  },
  amountExplicit: true,
  thresholdsExplicit: true,
  mutatesOnlyBillingBudget: args.apply,
  mutatesApplicationData: false,
  changesIam: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
}, null, 2));

if (exactMatches.length > 1) fail('Existe más de un budget idéntico para atlasmap-dev; no se crea otro.');
if (conflicting.length > 0) {
  fail('Ya existe un budget project-scoped distinto para atlasmap-dev; se aborta para no sobrescribir una decisión previa.');
}
if (exactMatches.length === 1) {
  console.log('Budget esperado: ya existe; operación idempotente completada.');
  process.exit(0);
}
if (!args.apply) {
  console.log('Dry-run: no se creó ningún budget.');
  process.exit(0);
}
if (!permissions.create || !permissions.list) {
  fail('La cuenta activa no tiene billing.budgets.create + billing.budgets.list en la billing account.');
}

const budgetBody = {
  displayName: desired.displayName,
  budgetFilter: {
    projects: [`projects/${PROJECT}`],
    calendarPeriod: 'MONTH',
  },
  amount: {
    specifiedAmount: desired.amount,
  },
  thresholdRules: desired.thresholds.map((thresholdPercent) => ({
    thresholdPercent,
    spendBasis: 'CURRENT_SPEND',
  })),
};

let created;
try {
  created = await requestJson(
    `https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`,
    { token, method: 'POST', body: budgetBody }
  );
} catch (error) {
  fail(`No se pudo crear el budget: ${error.message}`);
}
if (!created?.name || !budgetMatches(created, desired)) {
  fail('La respuesta de creación no coincide con el budget solicitado.');
}

let post;
try {
  post = await listProjectBudgets(token, billingAccountName);
} catch (error) {
  fail(`Budget creado, pero falló el post-check: ${error.message}`);
}
const postMatches = post.filter((budget) => budgetMatches(budget, desired));
if (postMatches.length !== 1 || post.length !== 1) {
  fail('Post-check inválido: no quedó exactamente un budget project-scoped con el contrato esperado.');
}

console.log(JSON.stringify({
  project: PROJECT,
  applied: true,
  budgetCreated: true,
  projectScopedBudgetCount: post.length,
  displayName: postMatches[0].displayName,
  specifiedAmount: normalizeMoney(postMatches[0]?.amount?.specifiedAmount),
  currencyCode: postMatches[0]?.amount?.specifiedAmount?.currencyCode || null,
  thresholds: normalizedThresholds(postMatches[0]),
  calendarPeriod: postMatches[0]?.budgetFilter?.calendarPeriod || null,
  billingAccountIdExposed: false,
  applicationDataUntouched: true,
  iamUntouched: true,
  storageV4WriteUnchanged: true,
  productionUntouched: true,
}, null, 2));
