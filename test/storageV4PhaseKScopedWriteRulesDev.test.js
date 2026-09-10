import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runnerPath = new URL('../scripts/runStorageV4PhaseKScopedWriteRulesDev.mjs', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const gitignorePath = new URL('../.gitignore', import.meta.url);

test('scoped rules runner es preflight read-only por defecto', async () => {
  const source = await readFile(runnerPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("const RELEASE_NAME = `projects/${PROJECT}/releases/cloud.firestore`"));
  assert.ok(source.includes('if (!apply && !rollback)'));
  assert.ok(source.includes("mode: 'preflight'"));
  assert.ok(source.includes('mutatesCloud: false'));
  assert.ok(source.includes('enablesGlobalStorageV4Write: false'));
  assert.ok(source.includes('touchesProduction: false'));
  assert.ok(source.includes('Preflight: no se creo ruleset ni se modifico la release de Firestore.'));
});

test('apply exige ruleset inmutable esperado y aborta ante drift o state previo', async () => {
  const source = await readFile(runnerPath, 'utf8');

  assert.ok(source.includes("argValue('--expected-current-ruleset')"));
  assert.ok(source.includes('Ya existe un state file Phase K. Ejecuta --rollback'));
  assert.ok(source.includes('currentRulesetName !== expectedCurrentRuleset'));
  assert.ok(source.includes('Drift detectado: Cloud apunta a'));
  assert.ok(source.includes('scopedBytes >= 256 * 1024'));
  assert.ok(source.includes("scopedTripPrefix: 'phase-k-e2e-*'"));
  assert.ok(source.includes('patchesOnlyReleaseRulesetName: true'));
});

test('apply registra original y temporal antes de depender de propagacion', async () => {
  const source = await readFile(runnerPath, 'utf8');
  const createIndex = source.indexOf('const created = await createScopedRuleset(token, scoped);');
  const originalIndex = source.indexOf('originalRulesetName: currentRulesetName', createIndex);
  const stateWriteIndex = source.indexOf('writeState(nextState);', originalIndex);
  const patchIndex = source.indexOf('const patched = await patchRelease(token, temporaryRulesetName);', stateWriteIndex);
  const propagationIndex = source.indexOf('await waitForExecutable(token, temporaryRulesetName);', patchIndex);

  assert.ok(createIndex >= 0);
  assert.ok(originalIndex > createIndex);
  assert.ok(stateWriteIndex > originalIndex);
  assert.ok(patchIndex > stateWriteIndex);
  assert.ok(propagationIndex > patchIndex);
});

test('rollback restaura exactamente ruleset y SHA originales y falla ante tercer ruleset', async () => {
  const source = await readFile(runnerPath, 'utf8');

  assert.ok(source.includes('state.originalRulesetName'));
  assert.ok(source.includes('state.originalSourceSha256'));
  assert.ok(source.includes('allowedCurrentRulesets'));
  assert.ok(source.includes('Rollback abortado por drift'));
  assert.ok(source.includes('await patchRelease(token, state.originalRulesetName)'));
  assert.ok(source.includes('await waitForExecutable(token, state.originalRulesetName)'));
  assert.ok(source.includes('restoredSourceSha256 !== state.originalSourceSha256'));
  assert.ok(source.includes('deleteRulesetBestEffort(token, state.temporaryRulesetName)'));
  assert.ok(source.includes('scopedWriteRulesActive: false'));
});

test('generated rules y rollback state local quedan fuera de Git', async () => {
  const [gitignore, packageSource] = await Promise.all([
    readFile(gitignorePath, 'utf8'),
    readFile(packagePath, 'utf8'),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(gitignore, /^firestore-phase-k-e2e\.rules$/m);
  assert.match(gitignore, /^\.phase-k-e2e-rules-state\.json$/m);
  assert.equal(
    packageJson.scripts['phase-k:e2e:scoped-write-rules-dev'],
    'node scripts/runStorageV4PhaseKScopedWriteRulesDev.mjs'
  );
});
