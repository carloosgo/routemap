import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { normalizePath, repoRoot, testInventory } from './testContracts.mjs';

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

function changedFiles() {
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
  const base = baseArg?.slice('--base='.length) || process.env.TEST_IMPACT_BASE || '';
  if (base) return gitLines(['diff', '--name-only', `${base}...HEAD`]);

  if (process.env.GITHUB_ACTIONS) {
    return gitLines(['diff', '--name-only', 'HEAD^', 'HEAD']);
  }

  return [...new Set([
    ...gitLines(['diff', '--name-only', 'HEAD']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ])];
}

const changed = changedFiles();
const changedSet = new Set(changed);
const impacted = [];

for (const test of testInventory()) {
  const matched = test.references.filter((reference) => changedSet.has(reference));
  if (matched.length) {
    impacted.push({ path: test.path, category: test.category, changedReferences: matched });
  }
}

const report = { changedFiles: changed, impactedTests: impacted };
const jsonArg = process.argv.find((arg) => arg.startsWith('--json='));
if (jsonArg) {
  writeFileSync(resolve(repoRoot, jsonArg.slice('--json='.length)), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`Test impact: ${changed.length} changed files, ${impacted.length} impacted test files`);
for (const item of impacted) {
  console.log(`  [${item.category}] ${item.path} <- ${item.changedReferences.join(', ')}`);
}

const legacy = impacted.filter((item) => item.category === 'legacy-static');
if (legacy.length) {
  console.log(`\nReview ${legacy.length} impacted legacy-static tests before closing the change.`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Test impact',
    '',
    `Changed files in this change: **${changed.length}**`,
    `Impacted tests: **${impacted.length}**`,
    `Impacted legacy-static tests requiring review: **${legacy.length}**`,
    '',
  ];
  lines.push(...impacted.slice(0, 40).map((item) => `- \`${item.category}\` — \`${item.path}\` ← ${item.changedReferences.map((path) => `\`${path}\``).join(', ')}`));
  if (impacted.length > 40) lines.push(`- …and ${impacted.length - 40} more`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}
