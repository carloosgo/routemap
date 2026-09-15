/* global process, console */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contractValues, repoRoot, testInventory } from './testContracts.mjs';

const files = testInventory();
const counts = Object.fromEntries(contractValues.map((category) => [category, 0]));
for (const file of files) counts[file.category] = (counts[file.category] || 0) + 1;

const baselinePath = resolve(repoRoot, 'test/legacy-static-baseline.json');
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : { legacyStatic: [] };
const baselineLegacy = new Set(
  Array.isArray(baseline.legacyStatic) ? baseline.legacyStatic : []
);
const currentLegacy = new Set(
  files.filter((file) => file.category === 'legacy-static').map((file) => file.path)
);
const newLegacy = [...currentLegacy].filter((path) => !baselineLegacy.has(path)).sort();
const resolvedLegacy = [...baselineLegacy].filter((path) => !currentLegacy.has(path)).sort();

const reportFiles = files.map((file) => ({
  path: file.path,
  category: file.category,
  reasons: file.reasons,
  missingReferences: file.missingReferences,
  references: file.references,
}));
const report = {
  generatedAt: new Date().toISOString(),
  total: files.length,
  counts,
  baseline: {
    legacyStatic: baselineLegacy.size,
    newLegacy,
    resolvedLegacy,
  },
  files: reportFiles,
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
console.log(`  legacy baseline: ${baselineLegacy.size}`);
console.log(`  new legacy-static: ${newLegacy.length}`);
console.log(`  resolved legacy-static: ${resolvedLegacy.length}`);

const debt = files.filter((file) => ['legacy-static', 'obsolete-candidate'].includes(file.category));
if (debt.length) {
  console.log('\nReview queue:');
  for (const file of debt) {
    console.log(`  [${file.category}] ${file.path}${file.reasons.length ? ` — ${file.reasons.join('; ')}` : ''}`);
  }
}

if (newLegacy.length) {
  console.log('\nNew legacy-static tests are not allowed:');
  for (const path of newLegacy) console.log(`  ${path}`);
}

if (resolvedLegacy.length) {
  console.log('\nLegacy-static debt removed since baseline:');
  for (const path of resolvedLegacy) console.log(`  ${path}`);
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
    `Legacy baseline: **${baselineLegacy.size}**`,
    `New legacy-static: **${newLegacy.length}**`,
    `Resolved legacy-static: **${resolvedLegacy.length}**`,
    `Obsolete candidates: **${counts['obsolete-candidate']}**`,
    '',
  ];
  if (newLegacy.length) {
    lines.push('#### New legacy-static debt', ...newLegacy.map((path) => `- \`${path}\``), '');
  }
  if (resolvedLegacy.length) {
    lines.push('#### Legacy debt removed', ...resolvedLegacy.map((path) => `- \`${path}\``), '');
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (
  process.argv.includes('--enforce-baseline')
  && (newLegacy.length > 0 || counts['obsolete-candidate'] > 0)
) {
  process.exitCode = 1;
}
