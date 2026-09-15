import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/runStorageV4PhaseKAlertPolicyChannelsDev.mjs', import.meta.url);
const readSource = async (path) => (await readFile(path, 'utf8')).replace(/\r\n?/g, '\n');

test('alert policy channel association es dry-run por defecto y bloqueada a dev', async () => {
  const source = await readSource(scriptPath);

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("argv.includes('--apply')"));
  assert.ok(source.includes('Dry-run: no se modifico ninguna alert policy.'));
  assert.ok(source.includes('touchesProduction: false'));
});

test('alert policy channel association exige exactamente las tres policies conocidas', async () => {
  const source = await readSource(scriptPath);

  assert.ok(source.includes("'16504134289496302618'"));
  assert.ok(source.includes("'3373477211018044916'"));
  assert.ok(source.includes("'9805388785302408646'"));
  assert.ok(source.includes('atlasPolicies.length !== EXPECTED_POLICY_NAMES.length'));
  assert.ok(source.includes('JSON.stringify(atlasPolicyNames) !== JSON.stringify(expectedNames)'));
});

test('alert policy channel association aborta si policy o canal estan habilitados', async () => {
  const source = await readSource(scriptPath);

  assert.ok(source.includes("policy?.enabled === true"));
  assert.ok(source.includes("channel?.enabled === true"));
  assert.ok(source.includes("channel?.verificationStatus === 'UNVERIFIED'"));
  assert.ok(source.includes('El notification channel Atlas debe permanecer deshabilitado durante esta asociacion.'));
});

test('alert policy channel association parchea solo notificationChannels', async () => {
  const source = await readSource(scriptPath);
  const patchBodyStart = source.indexOf('function buildPolicyPatchBody');
  const patchBodyEnd = source.indexOf('\n}\n\nasync function patchPolicyChannel', patchBodyStart) + 2;
  const patchBodySource = source.slice(patchBodyStart, patchBodyEnd);

  assert.ok(patchBodyStart >= 0);
  assert.ok(patchBodyEnd > patchBodyStart);
  assert.ok(source.includes("new URLSearchParams({ updateMask: 'notificationChannels' })"));
  assert.ok(source.includes("method: 'PATCH'"));
  assert.ok(patchBodySource.includes('notificationChannels: [channelName]'));
  assert.doesNotMatch(patchBodySource, /enabled\s*:/);
  assert.ok(source.includes('patchesOnlyNotificationChannels: true'));
  assert.ok(source.includes('changesAlertPolicyEnabled: false'));
});

test('alert policy channel association es idempotente y rechaza canales inesperados', async () => {
  const source = await readSource(scriptPath);

  assert.ok(source.includes("channels.length === 0 || (channels.length === 1 && channels[0] === channel.name)"));
  assert.ok(source.includes('normalizeChannels(policy).length === 0'));
  assert.ok(source.includes('alreadyAssociatedPolicyCount'));
  assert.ok(source.includes('associationNeededPolicyCount'));
});

test('alert policy channel association valida el post-check y preserva limites de Phase K', async () => {
  const source = await readSource(scriptPath);

  assert.ok(source.includes('alertPoliciesRemainDisabled: true'));
  assert.ok(source.includes('notificationChannelRemainsDisabled: true'));
  assert.ok(source.includes("patchedFields: ['notificationChannels']"));
  assert.ok(source.includes('budgetsUntouched: true'));
  assert.ok(source.includes('storageV4WriteUnchanged: true'));
  assert.ok(source.includes('productionUntouched: true'));
  assert.ok(source.includes('postPolicySummaries.some'));
});
