import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const contractValues = new Set([
  'behavior',
  'architecture',
  'integration',
  'legacy-static',
  'obsolete-candidate',
]);

function normalizePath(path) {
  return path.split('\\').join('/');
}

function collectTestFiles(directory = repoRoot, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(absolute, files);
      continue;
    }
    if (/\.test\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function explicitContract(content) {
  const match = content.match(/^\s*\/\/\s*test-contract:\s*([a-z-]+)\s*$/m);
  return match && contractValues.has(match[1]) ? match[1] : '';
}

function sourceInspection(content) {
  const readsFiles = /\b(?:readFile|readFileSync)\b/.test(content);
  const readsImplementation = /(?:src\/|functions\/|scripts\/|\.github\/|package\.json|eslint\.config\.js)/.test(content);
  const stringContracts = /(?:\.includes\(|assert\.(?:match|doesNotMatch)\()/m.test(content);
  return readsFiles && readsImplementation && stringContracts;
}

function staticReferences(content) {
  const references = new Set();
  const pattern = /\b(?:read|readSource)\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    if (/^(?:src|functions|scripts|\.github)\//.test(match[1]) || /^(?:package\.json|eslint\.config\.js)$/.test(match[1])) {
      references.add(match[1]);
    }
  }
  return [...references];
}

function classify(absolute) {
  const path = normalizePath(relative(repoRoot, absolute));
  const content = readFileSync(absolute, 'utf8');
  const explicit = explicitContract(content);
  const missingReferences = staticReferences(content).filter(
    (reference) => !existsSync(resolve(repoRoot, reference))
  );

  let category = explicit;
  const reasons = [];

  if (!category && path.startsWith('test/behavior/')) category = 'behavior';
  if (!category && path.startsWith('test/architecture/')) category = 'architecture';
  if (!category && path.startsWith('test/integration/')) category = 'integration';
  if (!category && path.startsWith('test/legacy-static/')) category = 'legacy-static';

  const inspectsSource = sourceInspection(content);
  if (!category && missingReferences.length) {
    category = 'obsolete-candidate';
    reasons.push('static reference no longer exists');
  } else if (!category && inspectsSource) {
    category = 'legacy-static';
    reasons.push('reads implementation source and asserts literal structure');
  } else if (!category && /(?:integration|e2e|emulator)/i.test(path)) {
    category = 'integration';
  } else if (!category) {
    category = 'behavior';
  }

  if (explicit) reasons.push(`explicit ${explicit} contract`);
  if (inspectsSource && category === 'architecture') reasons.push('intentional source-level guardrail');

  return { path, category, reasons, missingReferences };
}

const files = collectTestFiles().map(classify).sort((a, b) => a.path.localeCompare(b.path));
const counts = Object.fromEntries([...contractValues].map((category) => [category, 0]));
for (const file of files) counts[file.category] = (counts[file.category] || 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  total: files.length,
  counts,
  files,
};

const jsonArg = process.argv.find((arg) => arg.startsWith('--json='));
if (jsonArg) {
  const output = resolve(repoRoot, jsonArg.slice('--json='.length));
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`Test contract audit: ${files.length} files`);
for (const [category, count] of Object.entries(counts)) {
  console.log(`  ${category}: ${count}`);
}

const debt = files.filter((file) => ['legacy-static', 'obsolete-candidate'].includes(file.category));
if (debt.length) {
  console.log('\nReview queue:');
  for (const file of debt) {
    console.log(`  [${file.category}] ${file.path}${file.reasons.length ? ` — ${file.reasons.join('; ')}` : ''}`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Test contract audit',
    '',
    `Total: **${files.length}**`,
    '',
    '| Contract | Files |',
    '| --- | ---: |',
    ...Object.entries(counts).map(([category, count]) => `| ${category} | ${count} |`),
    '',
    `Review queue: **${debt.length}**`,
    '',
  ];
  if (debt.length) {
    lines.push(...debt.slice(0, 40).map((file) => `- \`${file.category}\` — \`${file.path}\``));
    if (debt.length > 40) lines.push(`- …and ${debt.length - 40} more in test-audit.json`);
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (process.argv.includes('--strict') && counts['obsolete-candidate'] > 0) {
  process.exitCode = 1;
}
