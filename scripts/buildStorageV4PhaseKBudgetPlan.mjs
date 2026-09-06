/* global process, console */

const PROJECT = 'atlasmap-dev';
const DEFAULT_DISPLAY_NAME = 'Atlas Storage v4 dev';

function argValue(name) {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function parsePositiveAmount(raw) {
  if (!raw) throw new Error('Falta --amount. No existe un monto default deliberadamente.');
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) {
    throw new Error('--amount debe ser un decimal positivo con hasta 9 decimales.');
  }
  const [whole, fraction = ''] = raw.split('.');
  const units = BigInt(whole);
  const nanos = Number((fraction + '000000000').slice(0, 9));
  if (units === 0n && nanos === 0) throw new Error('--amount debe ser mayor que cero.');
  return { units: units.toString(), nanos };
}

function parseThresholds(raw) {
  if (!raw) throw new Error('Falta --thresholds. No existen thresholds default deliberadamente.');
  const values = raw.split(',').map((value) => Number(value.trim()));
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0 || value > 2)) {
    throw new Error('--thresholds debe contener porcentajes decimales > 0 y <= 2.');
  }
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length !== values.length) throw new Error('--thresholds no debe contener valores duplicados.');
  return unique;
}

function parseDisplayName(raw) {
  const value = raw || DEFAULT_DISPLAY_NAME;
  if (value.length > 60) throw new Error('--display-name no puede exceder 60 caracteres.');
  if (!value.trim()) throw new Error('--display-name no puede quedar vacío.');
  return value.trim();
}

try {
  const amount = parsePositiveAmount(argValue('--amount'));
  const thresholds = parseThresholds(argValue('--thresholds'));
  const displayName = parseDisplayName(argValue('--display-name'));

  const budget = {
    displayName,
    budgetFilter: {
      projects: [`projects/${PROJECT}`],
      calendarPeriod: 'MONTH',
    },
    amount: {
      specifiedAmount: amount,
    },
    thresholdRules: thresholds.map((thresholdPercent) => ({
      thresholdPercent,
      spendBasis: 'CURRENT_SPEND',
    })),
  };

  console.log(JSON.stringify({
    project: PROJECT,
    purpose: 'Phase K single-project budget plan',
    mutatesBudgets: false,
    touchesProduction: false,
    requiresExplicitAmount: true,
    requiresExplicitThresholds: true,
    currencyCodeOmittedIntentionally: true,
    note: 'Plan only. Creation remains blocked until amount and thresholds are explicitly approved.',
    budget,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
