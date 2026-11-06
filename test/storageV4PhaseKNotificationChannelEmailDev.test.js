import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = new URL('../scripts/runStorageV4PhaseKNotificationChannelEmailDev.mjs', import.meta.url);

test('notification channel email dev es dry-run por defecto y exige destino explicito', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("argv.includes('--apply')"));
  assert.ok(source.includes("arg.startsWith('--email=')"));
  assert.ok(source.includes('emailAddressExposed: false'));
  assert.ok(source.includes('Dry-run: no se creo ningun notification channel.'));
});

test('notification channel email rechaza wrappers markdown/mailto antes de tocar gcloud', () => {
  const result = spawnSync(
    execPath,
    [fileURLToPath(scriptPath), '--email=[alerts@example.com](mailto:alerts@example.com)'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 2);
  assert.match(String(result.stderr || result.stdout || ''), /formato valido/i);
  assert.doesNotMatch(String(result.stderr || result.stdout || ''), /gcloud/i);
});

test('notification channel email se crea deshabilitado y no se asocia a policies', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("type: 'email'"));
  assert.ok(source.includes('labels: { email_address: email }'));
  assert.ok(source.includes('enabled: false'));
  assert.ok(source.includes("method: 'POST'"));
  assert.ok(source.includes('associatesAlertPolicies: false'));
  assert.ok(source.includes('enablesAlertPolicies: false'));
  assert.ok(source.includes('alertPoliciesUntouched: true'));
  assert.ok(source.includes('alertPoliciesRemainDisabled: true'));
  assert.doesNotMatch(source, /alertPolicies[^\n]*(patch|update|create|delete)/i);
});

test('notification channel email usa REST v3 y evita duplicados administrados', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('monitoring.googleapis.com/v3/projects/${PROJECT}/notificationChannels'));
  assert.ok(source.includes("'x-goog-user-project': PROJECT"));
  assert.ok(source.includes('existingChannels.length > 1'));
  assert.ok(source.includes("purpose: 'alerts'"));
  assert.ok(source.includes("system: 'atlas-storage-v4'"));
  assert.ok(source.includes("environment: 'dev'"));
  assert.ok(source.includes("phase: 'k'"));
});

test('notification channel email preserva budgets, WRITE y produccion', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('mutatesBudgets: false'));
  assert.ok(source.includes('enablesStorageV4Write: false'));
  assert.ok(source.includes('touchesProduction: false'));
  assert.ok(source.includes('budgetsUntouched: true'));
  assert.ok(source.includes('storageV4WriteUnchanged: true'));
  assert.ok(source.includes('productionUntouched: true'));
});
