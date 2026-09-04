/* global process, console */
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, repoRoot, testInventory } from './testContracts.mjs';

export const CORE_BUSINESS_TESTS = [
  'test/behavior/tripModelHardening.test.js',
  'test/behavior/segmentChainContinuity.test.js',
  'test/behavior/itineraryMapReorder.test.js',
  'test/behavior/storageV4EditorAutosave.test.js',
  'test/behavior/tripSummaryModel.test.js',
  'test/behavior/countryRunDividerBoundary.test.js',
  'test/behavior/crispDashedRoutes.test.js',
];

const FULL_PREFIXES = [
  'src/modules/',
  'src/infrastructure/',
  'functions/',
  'firebase-tests/',
  'scripts/',
  '.github/workflows/',
];

const FULL_FILES = new Set([
  'src/App.jsx',
  'src/main.jsx',
  'src/config.js',
  'firebase.json',
  'firestore.rules',
  'package.json',
  'package-lock.json',
  'functions/package.json',
  'functions/package-lock.json',
  'eslint.config.js',
]);

const UI_PREFIXES = ['src/app/', 'src/components/', 'src/i18n/'];
const CODE_PATTERN = /\.(?:js|jsx|mjs|cjs)$/i;
const STYLE_PATTERN = /\.(?:css|scss|sass|less)$/i;
const DOC_PATTERN = /(?:^|\/)README(?:\.[^/]+)?$|\.md$/i;
const ASSET_PATTERN = /\.(?:svg|png|jpe?g|webp|gif|ico)$/i;

function gitLines(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function changedFiles() {
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
  const base = baseArg?.slice('--base='.length) || process.env.TEST_IMPACT_BASE || '';
  if (base) return gitLines(['diff', '--name-only', `${base}...HEAD`]);
  if (process.env.GITHUB_ACTIONS) return gitLines(['diff', '--name-only', 'HEAD^', 'HEAD']);
  return [...new Set([
    ...gitLines(['diff', '--name-only', 'HEAD']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ])];
}

export function impactedTestsFor(changed) {
  const changedSet = new Set(changed);
  const impacted = [];
  for (const test of testInventory()) {
    const matched = test.references.filter((reference) => changedSet.has(reference));
    if (changedSet.has(test.path)) matched.unshift(test.path);
    if (matched.length) impacted.push({
      path: test.path,
      category: test.category,
      changedReferences: [...new Set(matched)],
    });
  }
  return impacted;
}

function isFullRisk(path) {
  return FULL_FILES.has(path) || FULL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isUiCode(path) {
  return CODE_PATTERN.test(path) && UI_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isLowRisk(path) {
  return STYLE_PATTERN.test(path) || DOC_PATTERN.test(path) || ASSET_PATTERN.test(path) || path === 'DESIGN_PRESERVATION.md';
}

export function buildVerificationPlan(changed, impacted) {
  if (!changed.length) {
    return { mode: 'full', tests: [], reason: 'No se pudo determinar el alcance del cambio; se escala por seguridad.' };
  }

  const fullRisk = changed.find(isFullRisk);
  if (fullRisk) {
    return { mode: 'full', tests: [], reason: `Cambio de alto impacto: ${fullRisk}` };
  }

  if (impacted.some((test) => test.category === 'integration')) {
    return { mode: 'full', tests: [], reason: 'El cambio impacta una prueba de integración.' };
  }

  const unknownCode = changed.find((path) => CODE_PATTERN.test(path) && !isUiCode(path) && !path.startsWith('test/'));
  if (unknownCode) {
    return { mode: 'full', tests: [], reason: `Código fuera de una zona UI segura: ${unknownCode}` };
  }

  const uiCode = changed.filter(isUiCode);
  if (uiCode.length && !impacted.length) {
    return { mode: 'full', tests: [], reason: 'Cambió código UI pero el análisis no encontró pruebas relacionadas; se escala por seguridad.' };
  }

  const unknown = changed.find((path) => !isLowRisk(path) && !isUiCode(path) && !path.startsWith('test/'));
  if (unknown) {
    return { mode: 'full', tests: [], reason: `Archivo no clasificado con seguridad: ${unknown}` };
  }

  const selected = new Set(impacted.filter((test) => test.category !== 'integration').map((test) => test.path));
  if (uiCode.length || changed.some((path) => STYLE_PATTERN.test(path))) {
    CORE_BUSINESS_TESTS.forEach((path) => selected.add(path));
  }

  return {
    mode: selected.size ? 'targeted' : 'lightweight',
    tests: [...selected].sort(),
    reason: selected.size
      ? 'Ejecutar pruebas impactadas más el núcleo de regresión de negocio.'
      : 'Cambio documental/activo sin código ejecutable relacionado.',
  };
}

function runSelectedTests(paths) {
  if (!paths.length) return;
  execFileSync(process.execPath, ['--test', ...paths], { cwd: repoRoot, stdio: 'inherit' });
}

function runFullTests() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['test'], { cwd: repoRoot, stdio: 'inherit' });
}

export function executePlan(plan, { preflight = false } = {}) {
  console.log(`Change verification mode: ${plan.mode}`);
  console.log(`Reason: ${plan.reason}`);
  if (plan.mode === 'full') {
    if (preflight) {
      console.log('Full regression required; the following full Quality gate will execute it.');
      return;
    }
    runFullTests();
    return;
  }
  if (plan.tests.length) {
    console.log(`Selected tests (${plan.tests.length}):`);
    plan.tests.forEach((path) => console.log(`  - ${path}`));
    runSelectedTests(plan.tests);
  }
}

export function main() {
  const changed = changedFiles();
  const impacted = impactedTestsFor(changed);
  const plan = buildVerificationPlan(changed, impacted);
  console.log(`Changed files: ${changed.length}; impacted tests: ${impacted.length}`);
  executePlan(plan, { preflight: process.argv.includes('--preflight') });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) main();
