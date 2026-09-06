/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'scripts', 'storage-v4-phase-k-slo-preflight.ps1'), 'utf8');

test('Phase K sync SLO separates synthetic alert-drill flushes', () => {
  assert.match(source, /\$syncSyntheticFlush = @\(\$syncFlush \| Where-Object \{ \$_\.synthetic -eq \$true \}\)/);
  assert.match(source, /\$syncOperationalFlush = @\(\$syncFlush \| Where-Object \{ \$_\.synthetic -ne \$true \}\)/);
  assert.match(source, /syntheticFlushEntries = \$syncSyntheticFlush\.Count/);
  assert.match(source, /syntheticUnexpectedError = \$syncSyntheticUnexpectedError/);
});

test('Phase K operational sync SLO uses only non-synthetic flushes', () => {
  assert.match(source, /\$syncSuccess = @\(\$syncOperationalFlush/);
  assert.match(source, /\$syncUnexpectedError = @\(\$syncOperationalFlush/);
  assert.match(source, /Percentile @\(\$syncOperationalFlush \| ForEach-Object \{ \$_\.durationMs \}\) 95/);
  assert.doesNotMatch(source, /\$syncUnexpectedError = @\(\$syncFlush/);
});
