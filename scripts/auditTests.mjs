import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contractValues, repoRoot, testInventory } from './testContracts.mjs';

const files = testInventory();
const counts = Object.fromEntries(contractValues.map((category) => [category, 0]));
for (const file of files) counts[file.category] = (counts[file.category] || 0) + 1;

const reportFiles = files.map(({ absolute, references, ...file }) => ({ ...file, references }));
const report = {
  generatedAt: new Date().toISOString(),
  total: files.length,
  counts,
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
