/* global fetch, process, console */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V4_PILOT_EVENTARC_DESTINATION_FUNCTION,
  V4_PILOT_EVENTARC_REGION,
  V4_PILOT_EVENTARC_TRIGGERS,
  V4_PILOT_SERVICE_REGION,
} from '../functions/v4PilotBackendManifest.js';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';
import {
  accessTokenFromGcloud,
  getRemoteConfigTemplate,
  resolveGcloud,
} from './storageV4RemoteConfigRestDev.mjs';
import { summarizeStorageV4RemoteConfig } from './storageV4PilotRemoteConfigModel.mjs';
import {
  getActiveFirestoreRuleset,
  listPilotEventarcTriggers,
} from './runStorageV4PilotStageVerifyDev.mjs';

export const PILOT_EVENTARC_IAM_PROJECT = 'atlasmap-dev';
export const PILOT_EVENTARC_SERVICE_ACCOUNT_ID = 'atlas-v4-eventarc';
export const PILOT_EVENTARC_SERVICE_ACCOUNT = `${PILOT_EVENTARC_SERVICE_ACCOUNT_ID}@${PILOT_EVENTARC_IAM_PROJECT}.iam.gserviceaccount.com`;
export const PILOT_EVENTARC_RECEIVER_ROLE = 'roles/eventarc.eventReceiver';
export const PILOT_EVENTARC_INVOKER_ROLE = 'roles/run.invoker';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const functionName = `projects/${PILOT_EVENTARC_IAM_PROJECT}/locations/${V4_PILOT_SERVICE_REGION}/functions/${V4_PILOT_EVENTARC_DESTINATION_FUNCTION}`;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function authHeaders(token, extra = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('token es obligatorio.');
  return {
    Authorization: `Bearer ${token}`,
    'x-goog-user-project': PILOT_EVENTARC_IAM_PROJECT,
    ...extra,
  };
}

async function readJson(url, {
  token,
  fetchFn = fetch,
  method = 'GET',
  body,
  allow404 = false,
  label = 'Cloud API',
} = {}) {
  const response = await fetchFn(url, {
    method,
    headers: authHeaders(token, body ? { 'Content-Type': 'application/json' } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (allow404 && response.status === 404) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  if (payload === null) return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} devolvió JSON inválido.`);
  }
  return payload;
}

function policyHasMemberRole(policy, role, member) {
  return (Array.isArray(policy?.bindings) ? policy.bindings : []).some((binding) => (
    binding?.role === role
    && !binding?.condition
    && Array.isArray(binding?.members)
    && binding.members.includes(member)
  ));
}

function remoteConfigSafeOff(summary) {
  return summary.enabled === 'false'
    && summary.killSwitch === 'true'
    && summary.mode === 'off'
    && summary.cohortPercent === '0';
}

function deployedRulesContent(ruleset) {
  const files = ruleset?.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.content !== 'string') {
    throw new Error('El Ruleset activo no contiene una única fuente verificable.');
  }
  return files[0].content;
}

function resourceId(name) {
  return typeof name === 'string' ? (name.split('/').pop() || '') : '';
}

export async function runStorageV4PilotEventarcIamPreflightDev({
  token,
  fetchFn = fetch,
  gcloud = resolveGcloud(),
  v3Rules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'),
  v4Rules = readFileSync(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
  log = (value) => console.log(value),
} = {}) {
  const accessToken = token || accessTokenFromGcloud(gcloud);
  const candidateRules = composePilotWriteRules(v3Rules, v4Rules);
  const expectedRulesSha256 = sha256(candidateRules);

  const [ingressFunction, activeRules, remoteConfig, existingTriggers, serviceAccount] = await Promise.all([
    readJson(`https://cloudfunctions.googleapis.com/v2/${functionName}`, {
      token: accessToken,
      fetchFn,
      allow404: true,
      label: 'Cloud Functions ingress GET',
    }),
    getActiveFirestoreRuleset({ token: accessToken, fetchFn }),
    getRemoteConfigTemplate({ token: accessToken, fetchFn }),
    listPilotEventarcTriggers({ token: accessToken, fetchFn }),
    readJson(
      `https://iam.googleapis.com/v1/projects/${PILOT_EVENTARC_IAM_PROJECT}/serviceAccounts/${encodeURIComponent(PILOT_EVENTARC_SERVICE_ACCOUNT)}`,
      {
        token: accessToken,
        fetchFn,
        allow404: true,
        label: 'IAM service account GET',
      }
    ),
  ]);

  const ingressActive = ingressFunction?.state === 'ACTIVE'
    && ingressFunction?.buildConfig?.runtime === 'nodejs22';
  const cloudRunResource = ingressFunction?.serviceConfig?.service || null;
  const cloudRunService = resourceId(cloudRunResource);
  const activeRulesSha256 = sha256(deployedRulesContent(activeRules.ruleset));
  const rulesReady = activeRules.release?.rulesetName === activeRules.ruleset?.name
    && activeRulesSha256 === expectedRulesSha256;
  const remoteConfigSummary = summarizeStorageV4RemoteConfig(remoteConfig.template);
  const remoteConfigOff = remoteConfigSafeOff(remoteConfigSummary);

  const expectedTriggerNames = new Set(V4_PILOT_EVENTARC_TRIGGERS.map((trigger) => trigger.name));
  const collidingTriggers = existingTriggers
    .map((trigger) => resourceId(trigger?.name))
    .filter((name) => expectedTriggerNames.has(name))
    .sort();

  let projectPolicy = null;
  let runPolicy = null;
  let callerActAs = false;
  if (serviceAccount) {
    projectPolicy = await readJson(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PILOT_EVENTARC_IAM_PROJECT}:getIamPolicy`,
      {
        token: accessToken,
        fetchFn,
        method: 'POST',
        body: { options: { requestedPolicyVersion: 3 } },
        label: 'Project IAM policy GET',
      }
    );
    const actAs = await readJson(
      `https://iam.googleapis.com/v1/projects/${PILOT_EVENTARC_IAM_PROJECT}/serviceAccounts/${encodeURIComponent(PILOT_EVENTARC_SERVICE_ACCOUNT)}:testIamPermissions`,
      {
        token: accessToken,
        fetchFn,
        method: 'POST',
        body: { permissions: ['iam.serviceAccounts.actAs'] },
        label: 'Service account actAs test',
      }
    );
    callerActAs = Array.isArray(actAs?.permissions)
      && actAs.permissions.includes('iam.serviceAccounts.actAs');
  }
  if (cloudRunResource) {
    runPolicy = await readJson(`https://run.googleapis.com/v2/${cloudRunResource}:getIamPolicy`, {
      token: accessToken,
      fetchFn,
      label: 'Cloud Run IAM policy GET',
    });
  }

  const member = `serviceAccount:${PILOT_EVENTARC_SERVICE_ACCOUNT}`;
  const eventReceiverReady = Boolean(serviceAccount)
    && policyHasMemberRole(projectPolicy, PILOT_EVENTARC_RECEIVER_ROLE, member);
  const runInvokerAtProject = Boolean(serviceAccount)
    && policyHasMemberRole(projectPolicy, PILOT_EVENTARC_INVOKER_ROLE, member);
  const runInvokerAtService = Boolean(serviceAccount)
    && policyHasMemberRole(runPolicy, PILOT_EVENTARC_INVOKER_ROLE, member);
  const runInvokerReady = runInvokerAtProject || runInvokerAtService;
  const exactLeastPrivilegeReady = Boolean(serviceAccount)
    && eventReceiverReady
    && runInvokerAtService
    && callerActAs;
  const baseStageReady = ingressActive && rulesReady && remoteConfigOff;
  const eventarcCreationReady = baseStageReady
    && exactLeastPrivilegeReady
    && collidingTriggers.length === 0;

  const result = Object.freeze({
    project: PILOT_EVENTARC_IAM_PROJECT,
    mode: 'eventarc-iam-preflight',
    regions: Object.freeze({
      eventarc: V4_PILOT_EVENTARC_REGION,
      destination: V4_PILOT_SERVICE_REGION,
    }),
    ingress: Object.freeze({
      functionName: V4_PILOT_EVENTARC_DESTINATION_FUNCTION,
      exists: Boolean(ingressFunction),
      active: ingressActive,
      cloudRunService,
    }),
    rules: Object.freeze({
      expectedSha256: expectedRulesSha256,
      activeSha256: activeRulesSha256,
      ready: rulesReady,
    }),
    remoteConfig: Object.freeze({
      safeOff: remoteConfigOff,
      enabled: remoteConfigSummary.enabled ?? null,
      killSwitch: remoteConfigSummary.killSwitch ?? null,
      mode: remoteConfigSummary.mode ?? null,
      cohortPercent: remoteConfigSummary.cohortPercent ?? null,
    }),
    serviceAccount: Object.freeze({
      email: PILOT_EVENTARC_SERVICE_ACCOUNT,
      exists: Boolean(serviceAccount),
      disabled: serviceAccount?.disabled ?? null,
      callerCanActAs: callerActAs,
      eventReceiverReady,
      runInvokerAtProject,
      runInvokerAtService,
      runInvokerReady,
      exactLeastPrivilegeReady,
    }),
    triggers: Object.freeze({
      expectedCount: V4_PILOT_EVENTARC_TRIGGERS.length,
      collidingNames: Object.freeze(collidingTriggers),
    }),
    baseStageReady,
    eventarcCreationReady,
    iamMutationRequiredForLeastPrivilege: baseStageReady && !exactLeastPrivilegeReady,
    createsServiceAccount: false,
    changesIam: false,
    createsEventarcTriggers: false,
    changesRemoteConfig: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  });

  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4PilotEventarcIamPreflightDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
