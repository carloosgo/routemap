import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PILOT_EVENTARC_INVOKER_ROLE,
  PILOT_EVENTARC_RECEIVER_ROLE,
  PILOT_EVENTARC_SERVICE_ACCOUNT,
} from '../scripts/runStorageV4PilotEventarcIamPreflightDev.mjs';

test('Eventarc IAM preflight usa identidad dedicada y roles mínimos', () => {
  assert.equal(
    PILOT_EVENTARC_SERVICE_ACCOUNT,
    'atlas-v4-eventarc@atlasmap-dev.iam.gserviceaccount.com'
  );
  assert.equal(PILOT_EVENTARC_RECEIVER_ROLE, 'roles/eventarc.eventReceiver');
  assert.equal(PILOT_EVENTARC_INVOKER_ROLE, 'roles/run.invoker');
});

test('Eventarc IAM preflight no contiene operaciones de mutación IAM/Eventarc/Remote Config', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotEventarcIamPreflightDev.mjs', import.meta.url),
    'utf8'
  );

  assert.match(source, /:getIamPolicy/);
  assert.match(source, /:testIamPermissions/);
  assert.match(source, /serviceAccounts\//);
  assert.match(source, /listPilotEventarcTriggers/);
  assert.match(source, /getRemoteConfigTemplate/);

  assert.doesNotMatch(source, /:setIamPolicy/);
  assert.doesNotMatch(source, /serviceAccounts[^\n]*create/i);
  assert.doesNotMatch(source, /eventarc[^\n]*triggers[^\n]*(?:create|patch|delete)/i);
  assert.doesNotMatch(source, /publishRemoteConfigTemplate/);
  assert.doesNotMatch(source, /firebase[^\n]*deploy/);
  assert.doesNotMatch(source, /gcloud[^\n]*(?:add-iam-policy-binding|eventarc triggers create)/i);
});
