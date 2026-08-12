import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-observability-preflight.ps1', import.meta.url);

test('observability preflight inventaria notification channels sin mutar Cloud', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("'beta', 'monitoring', 'channels', 'list'"));
  assert.ok(source.includes('notificationChannelProbeStatus'));
  assert.ok(source.includes('notificationChannelCount'));
  assert.ok(source.includes('enabledVerifiedNotificationChannelCount'));
  assert.ok(source.includes('verificationStatus'));
  assert.ok(source.includes('notificationChannelCount = $policyChannels.Count'));
  assert.ok(source.includes('mutatesCloud = $false'));
  assert.ok(source.includes('activatesAlertPolicies = $false'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.doesNotMatch(source, /channels\s+(create|delete|update)/i);
  assert.doesNotMatch(source, /policies\s+(create|delete|update)/i);
});
