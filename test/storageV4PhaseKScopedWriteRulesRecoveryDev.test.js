import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runnerPath = new URL('../scripts/runStorageV4PhaseKScopedWriteRulesRecoveryDev.mjs', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);

test('recovery exige identidad exacta de original y temporal', async () => {
  const source = await readFile(runnerPath, 'utf8');
  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("argValue('--original-ruleset')"));
  assert.ok(source.includes("argValue('--temporary-ruleset')"));
  assert.ok(source.includes("argValue('--original-source-sha256')"));
  assert.ok(source.includes("argValue('--temporary-source-sha256')"));
  assert.ok(source.includes('originalRulesetName === temporaryRulesetName'));
});

test('recovery aborta si Cloud apunta a un tercer ruleset', async () => {
  const source = await readFile(runnerPath, 'utf8');
  assert.ok(source.includes('allowedCurrentRulesets'));
  assert.ok(source.includes('Recovery abortado por drift'));
});

test('recovery valida SHA original y temporal antes de patch', async () => {
  const source = await readFile(runnerPath, 'utf8');
  const originalCheck = source.indexOf('observedOriginalSha256 !== originalSourceSha256');
  const tempCheck = source.indexOf('observedTemporarySha256 !== temporarySourceSha256');
  const patch = source.indexOf('await patchRelease(token, originalRulesetName)');
  assert.ok(originalCheck >= 0);
  assert.ok(tempCheck > originalCheck);
  assert.ok(patch > tempCheck);
});

test('recovery es dry-run por defecto y apply solo restaura release y limpia temporal conocido', async () => {
  const source = await readFile(runnerPath, 'utf8');
  assert.ok(source.includes("mode: apply ? 'recovery-apply-plan' : 'recovery-preflight'"));
  assert.ok(source.includes('if (!apply)'));
  assert.ok(source.includes('Recovery preflight: no se modifico la release ni se elimino ningun ruleset.'));
  assert.ok(source.includes("updateMask: 'rulesetName'"));
  assert.ok(source.includes('deleteRulesetBestEffort(token, temporaryRulesetName)'));
  assert.ok(source.includes('scopedWriteRulesActive: false'));
  assert.ok(source.includes('globalStorageV4WriteFlagChanged: false'));
  assert.ok(source.includes('productionUntouched: true'));
});

test('package expone recovery como comando separado', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(
    packageJson.scripts['phase-k:e2e:scoped-write-rules-recover-dev'],
    'node scripts/runStorageV4PhaseKScopedWriteRulesRecoveryDev.mjs'
  );
});
