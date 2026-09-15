/* global process, console */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildAtlasStorageV4MonthlyCostScenarios } from './storageV4AtlasCostModel.mjs';

function option(name) {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function classification(value) {
  const normalized = requiredText(value, 'classification');
  if (!['simulation', 'measured', 'approved'].includes(normalized)) {
    throw new TypeError('classification debe ser simulation, measured o approved.');
  }
  return normalized;
}

function isoDate(value) {
  const normalized = requiredText(value, 'assumptionsAsOf');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new TypeError('assumptionsAsOf debe usar YYYY-MM-DD.');
  }
  return normalized;
}

async function main() {
  const inputArg = requiredText(option('--input'), '--input');
  const inputPath = resolve(process.cwd(), inputArg);
  const parsed = JSON.parse(await readFile(inputPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('El input debe ser un objeto JSON.');
  }

  const evidenceClass = classification(parsed.classification);
  const assumptionsAsOf = isoDate(parsed.assumptionsAsOf);
  const assumptionsBasis = requiredText(parsed.assumptionsBasis, 'assumptionsBasis');
  const scenarios = buildAtlasStorageV4MonthlyCostScenarios(
    parsed.capacityAssumptions,
    parsed.priceBook
  );

  const output = {
    generatedAtUtc: new Date().toISOString(),
    project: 'atlasmap-dev',
    purpose: 'Storage v4 Phase K cost scenarios',
    classification: evidenceClass,
    forecastEligible: evidenceClass === 'measured' || evidenceClass === 'approved',
    assumptionsAsOf,
    assumptionsBasis,
    mutatesCloud: false,
    mutatesBudgets: false,
    enablesStorageV4Write: false,
    touchesProduction: false,
    scenarios,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
