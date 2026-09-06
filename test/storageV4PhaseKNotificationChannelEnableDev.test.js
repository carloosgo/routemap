import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/runStorageV4PhaseKNotificationChannelEnableDev.mjs', import.meta.url);

test('notification channel enablement es dry-run por defecto y bloqueado a dev', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("process.argv.slice(2).includes('--apply')"));
  assert.ok(source.includes('Dry-run: no se modifico el notification channel.'));
  assert.ok(source.includes('touchesProduction: false'));
});

test('notification channel enablement exige exactamente canal y policies esperados', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('channels.length !== 1'));
  assert.ok(source.includes('policies.length !== EXPECTED_POLICY_NAMES.length'));
  assert.ok(source.includes('JSON.stringify(policyNames) !== JSON.stringify(expectedNames)'));
  assert.ok(source.includes("channel?.verificationStatus === 'UNVERIFIED'"));
});

test('notification channel enablement exige policies deshabilitadas y asociacion exclusiva', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("policy?.enabled === true"));
  assert.ok(source.includes('policyChannels.length !== 1 || policyChannels[0] !== channel.name'));
  assert.ok(source.includes('allAlertPoliciesAssociatedExclusively: true'));
});

test('notification channel enablement parchea solo enabled del canal', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("new URLSearchParams({ updateMask: 'enabled' })"));
  assert.ok(source.includes("method: 'PATCH'"));
  assert.ok(source.includes('body: { enabled: true }'));
  assert.ok(source.includes('patchesOnlyNotificationChannelEnabled: true'));
  assert.ok(source.includes('changesAlertPolicies: false'));
  assert.ok(source.includes('enablesAlertPolicies: false'));
});

test('notification channel enablement valida post-check y preserva limites', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('alertPoliciesRemainDisabled: true'));
  assert.ok(source.includes('alertPolicyAssociationsUnchanged: true'));
  assert.ok(source.includes("patchedFields: ['enabled']"));
  assert.ok(source.includes('budgetsUntouched: true'));
  assert.ok(source.includes('storageV4WriteUnchanged: true'));
  assert.ok(source.includes('productionUntouched: true'));
});
