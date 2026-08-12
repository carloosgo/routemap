import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-slo-preflight.ps1', import.meta.url);

test('SLO preflight queda bloqueado a atlasmap-dev y solo lee Logging', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('gcloud logging read'));
  assert.equal(source.includes("'create'"), false);
  assert.equal(source.includes("'update'"), false);
  assert.equal(source.includes("'delete'"), false);
  assert.equal(source.includes('--apply'), false);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
});

test('SLO preflight calcula percentiles y ratios sobre denominadores semanticos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  for (const percentile of ['p50', 'p95', 'p99']) {
    assert.ok(source.includes(`${percentile} = Percentile`));
  }
  assert.ok(source.includes('$syncMeasured = $syncSuccess + $syncUnexpectedError'));
  assert.ok(source.includes('$cacheLookupMeasured = $cacheHit + $cacheMiss'));
  assert.ok(source.includes('actionableSuccessRatePercent'));
  assert.ok(source.includes('hitRatePercent'));
  assert.ok(source.includes('truncated ='));
});
