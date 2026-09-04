/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { URLSearchParams } from 'node:url';

const PROJECT = 'atlasmap-prod';
const DISPLAY_NAME = 'Atlas Storage v4 production';
const CONFIRMATION = 'CREATE-ATLAS-V4-PROD-L2-BUDGET';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function positiveAmount(raw) {
  if (!raw) fail('Falta --amount. No existe monto default deliberadamente.', 2);
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) fail('--amount debe ser un decimal positivo.', 2);
  const [whole, fraction = ''] = raw.split('.');
  const units = BigInt(whole);
  const nanos = Number((fraction + '000000000').slice(0, 9));
  if (units === 0n && nanos === 0) fail('--amount debe ser mayor que cero.', 2);
  return { units: units.toString(), nanos };
}

function thresholds(raw) {
  if (!raw) fail('Falta --thresholds. No existen thresholds default deliberadamente.', 2);
  const values = raw.split(',').map((item) => Number(item.trim()));
  if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0 || value > 1)) {
    fail('--thresholds debe contener porcentajes decimales > 0 y <= 1.', 2);
  }
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length !== values.length) fail('--thresholds no admite duplicados.', 2);
  return unique;
}

function parseArgs(args = []) {
  let apply = false;
  let confirm = '';
  let amountRaw = '';
  let thresholdRaw = '';
  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else if (arg.startsWith('--amount=')) amountRaw = arg.slice('--amount='.length).trim();
    else if (arg.startsWith('--thresholds=')) thresholdRaw = arg.slice('--thresholds='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  const amount = positiveAmount(amountRaw);
  const parsedThresholds = thresholds(thresholdRaw);
  if (!apply && confirm) fail('--confirm solo se admite con --apply.', 2);
  if (apply && confirm !== CONFIRMATION) fail(`--apply exige --confirm=${CONFIRMATION}.`, 2);
  return { apply, amount, thresholds: parsedThresholds };
}

function candidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const values = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  if (process.env.LOCALAPPDATA) values.push(join(process.env.LOCALAPPDATA, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  return values;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', hasPath ? basename(executable) : executable, ...args], {
      ...options,
      ...(hasPath ? { cwd: dirname(executable) } : {}),
    });
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of candidates()) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(executable, args, label) {
  const result = runProcess(executable, args);
  if (result.error) fail(`${label}: ${result.error.message}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) fail(`${label}: ${stderr || stdout || `exit ${result.status}`}`);
  return stdout;
}

async function requestJson(url, token, { method = 'GET', body } = {}) {
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
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) fail(`Google API HTTP ${response.status}: ${payload?.error?.message || payload?.raw || response.statusText}`);
  return payload;
}

function normalizedMoney(value) {
  return { units: String(value?.units || '0'), nanos: Number(value?.nanos || 0) };
}

function normalizedThresholds(budget) {
  return (Array.isArray(budget?.thresholdRules) ? budget.thresholdRules : [])
    .map((rule) => Number(rule?.thresholdPercent))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function matches(budget, desired) {
  return budget?.displayName === DISPLAY_NAME &&
    JSON.stringify(normalizedMoney(budget?.amount?.specifiedAmount)) === JSON.stringify(desired.amount) &&
    JSON.stringify(normalizedThresholds(budget)) === JSON.stringify(desired.thresholds);
}

async function listBudgets(token, billingAccountName) {
  const params = new URLSearchParams({ scope: `projects/${PROJECT}`, pageSize: '100' });
  const payload = await requestJson(`https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets?${params}`, token);
  return Array.isArray(payload?.budgets) ? payload.budgets : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L2',
    operation: 'configure-production-budget',
    mode: args.apply ? 'apply' : 'plan',
    project: PROJECT,
    displayName: DISPLAY_NAME,
    amountExplicit: true,
    thresholdsExplicit: true,
    amount: args.amount,
    thresholds: args.thresholds,
    calendarPeriod: 'MONTH',
    spendBasis: 'CURRENT_SPEND',
    budgetIsAlertOnlyNotHardCap: true,
    billingAccountIdExposed: false,
    mutatesOnlyBillingBudget: args.apply,
    mutatesApplicationData: false,
    changesIam: false,
    opensFirestoreRules: false,
    enablesStorageV4Read: false,
    enablesStorageV4Write: false,
    confirmationRequiredForApply: CONFIRMATION,
  }, null, 2));
  if (!args.apply) return;

  const gcloud = resolveGcloud();
  if (!gcloud) fail('No se encontró gcloud.');
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer cuenta gcloud');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const billing = JSON.parse(runChecked(gcloud, ['billing', 'projects', 'describe', PROJECT, '--format=json'], 'No se pudo leer billing'));
  if (billing?.billingEnabled !== true) fail('Billing productivo no está habilitado.');
  const billingAccountName = typeof billing?.billingAccountName === 'string' ? billing.billingAccountName : '';
  if (!/^billingAccounts\/[A-Z0-9-]+$/i.test(billingAccountName)) fail('No se pudo resolver billing account productiva.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  const existing = await listBudgets(token, billingAccountName);
  const exact = existing.filter((budget) => matches(budget, args));
  const conflicts = existing.filter((budget) => !matches(budget, args));
  if (exact.length > 1) fail('Existe más de un budget productivo idéntico; se requiere revisión manual.');
  if (conflicts.length > 0) fail('Ya existe un budget productivo distinto; no será sobrescrito automáticamente.');
  if (exact.length === 1) {
    console.log(JSON.stringify({ phase: 'L2', pass: true, project: PROJECT, budgetState: 'already-present', billingAccountIdExposed: false }, null, 2));
    return;
  }

  const created = await requestJson(`https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`, token, {
    method: 'POST',
    body: {
      displayName: DISPLAY_NAME,
      budgetFilter: { projects: [`projects/${PROJECT}`], calendarPeriod: 'MONTH' },
      amount: { specifiedAmount: args.amount },
      thresholdRules: args.thresholds.map((thresholdPercent) => ({ thresholdPercent, spendBasis: 'CURRENT_SPEND' })),
    },
  });
  if (!created?.name || !matches(created, args)) fail('La respuesta de creación no coincide con el budget solicitado.');
  const post = await listBudgets(token, billingAccountName);
  const postExact = post.filter((budget) => matches(budget, args));
  if (post.length !== 1 || postExact.length !== 1) fail('Post-check: no quedó exactamente un budget productivo con el contrato esperado.');

  console.log(JSON.stringify({
    phase: 'L2',
    pass: true,
    project: PROJECT,
    budgetState: 'created',
    projectScopedBudgetCount: 1,
    displayName: DISPLAY_NAME,
    specifiedAmount: normalizedMoney(postExact[0]?.amount?.specifiedAmount),
    currencyCode: postExact[0]?.amount?.specifiedAmount?.currencyCode || null,
    thresholds: normalizedThresholds(postExact[0]),
    billingAccountIdExposed: false,
    applicationDataMutated: false,
    storageV4ReadEnabled: false,
    storageV4WriteEnabled: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
