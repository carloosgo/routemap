import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const contractValues = [
  'behavior',
  'architecture',
  'integration',
  'legacy-static',
  'obsolete-candidate',
];

const contractSet = new Set(contractValues);
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const architectureNameHint = /(?:architecture|boundar(?:y|ies)|wiring|manifest|contract|composition|separation|guard|security|isolation|preflight|deploy|launcher|rules|appcheck|telemetry|monitoring|metrics|foundation|repository|recovery|restore|budget|checkpoint|provider|rolloutcompatibility|lifecycle|eventarc|remoteconfig|stage|indexeddb|transport|audit|performance|scheduler|precision|storagev4phase[k-l]|storagev4pilotplan|v4pilotbackendbundle)/i;

export function normalizePath(path) {
  return path.split('\\').join('/');
}

export function collectTestFiles(directory = repoRoot, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(absolute, files);
      continue;
    }
    if (/\.(?:test|spec)\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function explicitContract(content) {
  const match = content.match(/^\s*\/\/\s*test-contract:\s*([a-z-]+)\s*$/m);
  return match && contractSet.has(match[1]) ? match[1] : '';
}

function sourceInspection(content) {
  const readsFiles = /\b(?:readFile|readFileSync)\b/.test(content);
  const readsImplementation = /(?:src\/|functions\/|scripts\/|\.github\/|package\.json|eslint\.config\.js)/.test(content);
  const stringContracts = /(?:\.includes\(|assert\.(?:match|doesNotMatch)\()/m.test(content);
  return readsFiles && readsImplementation && stringContracts;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectedMissingReference(content, reference) {
  const escaped = escapeRegExp(reference);
  return new RegExp(
    `assert\\.rejects\\([\\s\\S]{0,220}(?:read|readSource)\\(\\s*['"]${escaped}['"]`,
    'm'
  ).test(content);
}

function staticReferences(content) {
  const references = new Set();
  const pattern = /\b(?:read|readSource)\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    if (/^(?:src|functions|scripts|\.github)\//.test(match[1]) || /^(?:package(?:-lock)?\.json|eslint\.config\.js|index\.html)$/.test(match[1])) {
      references.add(match[1]);
    }
  }
  return [...references];
}

function importReferences(content, absolute) {
  const references = new Set();
  const pattern = /(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g;
  for (const match of content.matchAll(pattern)) {
    const resolved = resolve(dirname(absolute), match[1]);
    const path = normalizePath(relative(repoRoot, resolved));
    if (!path.startsWith('../')) references.add(path);
  }
  return [...references];
}

export function classifyTest(absolute) {
  const path = normalizePath(relative(repoRoot, absolute));
  const content = readFileSync(absolute, 'utf8');
  const explicit = explicitContract(content);
  const staticRefs = staticReferences(content);
  const missingReferences = staticRefs.filter(
    (reference) => !expectedMissingReference(content, reference) && !existsSync(resolve(repoRoot, reference))
  );
  const inspectsSource = sourceInspection(content);

  let category = explicit;
  const reasons = [];

  if (!category && path.startsWith('test/behavior/')) category = 'behavior';
  if (!category && path.startsWith('test/architecture/')) category = 'architecture';
  if (!category && path.startsWith('test/integration/')) category = 'integration';
  if (!category && path.startsWith('test/legacy-static/')) category = 'legacy-static';
  if (!category && (path.startsWith('firebase-tests/') || /\.emulator\.spec\./i.test(path))) {
    category = 'integration';
    reasons.push('emulator or Firestore rules integration contract');
  }

  if (!category && missingReferences.length) {
    category = 'obsolete-candidate';
    reasons.push('static reference no longer exists');
  } else if (!category && inspectsSource && architectureNameHint.test(path)) {
    category = 'architecture';
    reasons.push('source-level guardrail with architectural intent');
  } else if (!category && inspectsSource) {
    category = 'legacy-static';
    reasons.push('reads implementation source and asserts literal structure');
  } else if (!category && /(?:integration|e2e|emulator)/i.test(path)) {
    category = 'integration';
  } else if (!category) {
    category = 'behavior';
  }

  if (explicit) reasons.push(`explicit ${explicit} contract`);
  if (inspectsSource && category === 'architecture' && explicit) {
    reasons.push('intentional source-level guardrail');
  }

  const references = [...new Set([...staticRefs, ...importReferences(content, absolute)])];
  return { path, absolute, category, reasons, missingReferences, references };
}

export function testInventory() {
  return collectTestFiles().map(classifyTest).sort((a, b) => a.path.localeCompare(b.path));
}
