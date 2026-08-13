import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PILOT_EVENTARC_IAM_BOOTSTRAP_CONFIRM,
  PILOT_EVENTARC_INGRESS_REGION,
  PILOT_EVENTARC_INGRESS_SERVICE,
} from '../scripts/runStorageV4PilotEventarcIamBootstrapDev.mjs';
import {
  PILOT_EVENTARC_CONTENT_TYPE,
  PILOT_EVENTARC_DATABASE,
  PILOT_EVENTARC_DEPLOY_CONFIRM,
  PILOT_EVENTARC_DESTINATION_SERVICE,
  PILOT_EVENTARC_EVENT_TYPE,
} from '../scripts/runStorageV4PilotEventarcDeployDev.mjs';
import {
  PILOT_EVENTARC_SERVICE_ACCOUNT,
  PILOT_EVENTARC_RECEIVER_ROLE,
  PILOT_EVENTARC_INVOKER_ROLE,
} from '../scripts/runStorageV4PilotEventarcIamPreflightDev.mjs';
import {
  V4_PILOT_EVENTARC_REGION,
  V4_PILOT_EVENTARC_TRIGGERS,
  V4_PILOT_SERVICE_REGION,
} from '../functions/v4PilotBackendManifest.js';
import { gcloudCandidates } from '../scripts/storageV4RemoteConfigRestDev.mjs';

test('bootstrap IAM queda separado de Eventarc y no auto-concede actAs', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotEventarcIamBootstrapDev.mjs', import.meta.url),
    'utf8'
  );
  assert.equal(PILOT_EVENTARC_IAM_BOOTSTRAP_CONFIRM, 'APPLY-ATLAS-V4-EVENTARC-IAM-DEV');
  assert.equal(PILOT_EVENTARC_INGRESS_SERVICE, 'v4firestoreeventingress');
  assert.equal(PILOT_EVENTARC_INGRESS_REGION, 'us-central1');
  assert.equal(PILOT_EVENTARC_RECEIVER_ROLE, 'roles/eventarc.eventReceiver');
  assert.equal(PILOT_EVENTARC_INVOKER_ROLE, 'roles/run.invoker');
  assert.match(source, /iam', 'service-accounts', 'create'/);
  assert.match(source, /'--role', PILOT_EVENTARC_RECEIVER_ROLE/);
  assert.match(source, /'--role', PILOT_EVENTARC_INVOKER_ROLE/);
  assert.match(source, /grantCallerActAsAutomatically:\s*false/);
  assert.match(source, /callerActAsGrantedAutomatically:\s*false/);
  assert.doesNotMatch(source, /roles\/iam\.serviceAccountUser/);
  assert.doesNotMatch(source, /eventarc', 'triggers', 'create'/);
  assert.doesNotMatch(source, /remote-config|Remote Config publish/i);
});

test('gcloud en Windows prioriza PATH antes del fallback LOCALAPPDATA con espacios', () => {
  const candidates = gcloudCandidates({
    platform: 'win32',
    localAppData: 'C:\\Users\\Carlos Gonzalez\\AppData\\Local',
  });
  assert.deepEqual(candidates.slice(0, 3), ['gcloud.cmd', 'gcloud.exe', 'gcloud']);
  assert.equal(
    candidates.at(-1).replaceAll('\\', '/'),
    'C:/Users/Carlos Gonzalez/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
  );
});

test('deploy Eventarc usa filtros oficiales Firestore y destino privado esperado', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotEventarcDeployDev.mjs', import.meta.url),
    'utf8'
  );
  assert.equal(PILOT_EVENTARC_DEPLOY_CONFIRM, 'CREATE-ATLAS-V4-EVENTARC-TRIGGERS-DEV');
  assert.equal(PILOT_EVENTARC_EVENT_TYPE, 'google.cloud.firestore.document.v1.written');
  assert.equal(PILOT_EVENTARC_DATABASE, '(default)');
  assert.equal(PILOT_EVENTARC_CONTENT_TYPE, 'application/protobuf');
  assert.equal(PILOT_EVENTARC_DESTINATION_SERVICE, 'v4firestoreeventingress');
  assert.equal(V4_PILOT_EVENTARC_REGION, 'northamerica-south1');
  assert.equal(V4_PILOT_SERVICE_REGION, 'us-central1');
  assert.equal(V4_PILOT_EVENTARC_TRIGGERS.length, 5);
  assert.match(source, /--event-filters-path-pattern/);
  assert.match(source, /document=\$\{trigger\.document\}/);
  assert.match(source, /--event-data-content-type/);
  assert.match(source, /'--service-account', PILOT_EVENTARC_SERVICE_ACCOUNT/);
});

test('deploy Eventarc exige preflight listo y revierte creación parcial', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotEventarcDeployDev.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /preflight\.eventarcCreationReady/);
  assert.match(source, /created\.push\(trigger\.name\)/);
  assert.match(source, /deleteCreatedTrigger/);
  assert.match(source, /Rollback parcial/);
  assert.match(source, /remoteConfigChanged:\s*false/);
  assert.match(source, /clientPilotTrafficActivated:\s*false/);
  assert.match(source, /firestoreRulesChanged:\s*false/);
  assert.match(source, /applicationDataMutated:\s*false/);
});
