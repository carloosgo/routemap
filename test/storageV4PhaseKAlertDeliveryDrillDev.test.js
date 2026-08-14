import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const runnerPath = fileURLToPath(
  new URL('../scripts/runStorageV4PhaseKAlertDeliveryDrillDev.mjs', import.meta.url)
);

async function runnerSource() {
  return readFile(runnerPath, 'utf8');
}

test('alert delivery drill escribe la señal sintética por Logging REST API', async () => {
  const source = await runnerSource();

  assert.match(source, /https:\/\/logging\.googleapis\.com\/v2\/entries:write/);
  assert.match(source, /await writeSyntheticSyncError\(token, drillId\);/);
  assert.doesNotMatch(source, /'logging',\s*'write'/);
  assert.match(source, /type: 'cloud_run_revision'/);
  assert.match(source, /message: 'storage_v4_sync_metric'/);
  assert.match(source, /outcome: 'unexpected-error'/);
});

test('alert delivery drill conserva cleanup de policy temporal y límites dev', async () => {
  const source = await runnerSource();

  assert.match(source, /const PROJECT = 'atlasmap-dev'/);
  assert.match(source, /finally \{/);
  assert.match(source, /await deletePolicy\(token, policy\.name\)/);
  assert.match(source, /touchesProduction: false/);
  assert.match(source, /mutatesApplicationData: false/);
  assert.match(source, /mutatesBudgets: false/);
});
