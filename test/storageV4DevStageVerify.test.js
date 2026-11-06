import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_STAGE_VERIFY_DATABASE,
  DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE,
  DEV_STAGE_VERIFY_EVENT_TYPE,
  DEV_STAGE_VERIFY_PROJECT,
  DEV_STAGE_VERIFY_PRODUCTION_PROJECT,
  DEV_STAGE_VERIFY_RELEASE,
  buildV4DevStageVerification,
  requestJson,
} from '../scripts/runStorageV4DevStageVerify.mjs';
import {
  V4_BACKEND_FUNCTION_NAMES,
  V4_EVENTARC_TRIGGERS,
  V4_SERVICE_REGION,
} from '../functions/v4BackendManifest.js';

const CANDIDATE_RULES = 'rules_version = "2";\nservice cloud.firestore { match /databases/{database}/documents {} }\n';
const RULESET_NAME = `projects/${DEV_STAGE_VERIFY_PROJECT}/rulesets/ruleset-v4`;
const CLOUD_RUN_SERVICE = 'v4firestoreeventingress';

function cloudFunction(name, overrides = {}) {
  return {
    name: `projects/${DEV_STAGE_VERIFY_PROJECT}/locations/${V4_SERVICE_REGION}/functions/${name}`,
    state: 'ACTIVE',
    buildConfig: { runtime: 'nodejs22' },
    serviceConfig: name === 'v4FirestoreEventIngress'
      ? { service: `projects/${DEV_STAGE_VERIFY_PROJECT}/locations/${V4_SERVICE_REGION}/services/${CLOUD_RUN_SERVICE}` }
      : {},
    ...overrides,
  };
}

function eventarcTrigger(expected, overrides = {}) {
  return {
    name: `projects/${DEV_STAGE_VERIFY_PROJECT}/locations/northamerica-south1/triggers/${expected.name}`,
    eventFilters: [
      { attribute: 'type', value: DEV_STAGE_VERIFY_EVENT_TYPE },
      { attribute: 'database', value: DEV_STAGE_VERIFY_DATABASE },
      { attribute: 'document', value: expected.document, operator: 'match-path-pattern' },
    ],
    eventDataContentType: DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE,
    destination: {
      cloudRun: {
        service: CLOUD_RUN_SERVICE,
        region: V4_SERVICE_REGION,
      },
    },
    serviceAccount: `atlas-v4-eventarc@${DEV_STAGE_VERIFY_PROJECT}.iam.gserviceaccount.com`,
    conditions: {},
    ...overrides,
  };
}

function release() {
  return {
    name: DEV_STAGE_VERIFY_RELEASE,
    rulesetName: RULESET_NAME,
  };
}

function ruleset(content = CANDIDATE_RULES) {
  return {
    name: RULESET_NAME,
    source: { files: [{ name: 'firestore.rules', content }] },
  };
}

function canonicalInput(overrides = {}) {
  return {
    candidateRules: CANDIDATE_RULES,
    cloudFunctions: V4_BACKEND_FUNCTION_NAMES.map((name) => cloudFunction(name)),
    eventarcTriggers: V4_EVENTARC_TRIGGERS.map((trigger) => eventarcTrigger(trigger)),
    release: release(),
    ruleset: ruleset(),
    ...overrides,
  };
}

function response({ ok, status, payload, retryAfter = null }) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'retry-after' ? retryAfter : null;
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('canonical v4 dev stage is fully staged and read-only', () => {
  assert.equal(DEV_STAGE_VERIFY_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_STAGE_VERIFY_PRODUCTION_PROJECT, 'atlasmap-prod');

  const result = buildV4DevStageVerification(canonicalInput());

  assert.equal(result.project, 'atlasmap-dev');
  assert.equal(result.expectedFunctionCount, 3);
  assert.equal(result.functionsReady, true);
  assert.equal(result.eventarc.expectedTriggerCount, 6);
  assert.equal(result.eventarc.ready, true);
  assert.equal(result.rules.matchesCandidate, true);
  assert.equal(result.backendReady, true);
  assert.deepEqual(result.readinessCandidates, {
    writeRulesReady: true,
    eventIngressReady: true,
    lifecycleReady: true,
    purgeReady: true,
  });
  assert.equal(result.staged, true);
  assert.equal(result.mutatesCloud, false);
  assert.equal(result.mutatesApplicationData, false);
  assert.equal(result.touchesProduction, false);
});

test('missing or unhealthy canonical Functions block the stage', () => {
  const missing = buildV4DevStageVerification(canonicalInput({
    cloudFunctions: V4_BACKEND_FUNCTION_NAMES
      .filter((name) => name !== 'v4TripPurge')
      .map((name) => cloudFunction(name)),
  }));
  assert.equal(missing.functionsReady, false);
  assert.deepEqual(missing.missingFunctions, ['v4TripPurge']);
  assert.equal(missing.staged, false);

  const wrongRuntime = buildV4DevStageVerification(canonicalInput({
    cloudFunctions: V4_BACKEND_FUNCTION_NAMES.map((name) => (
      name === 'v4TripLifecycle'
        ? cloudFunction(name, { buildConfig: { runtime: 'nodejs20' } })
        : cloudFunction(name)
    )),
  }));
  assert.equal(wrongRuntime.functionsReady, false);
  assert.deepEqual(wrongRuntime.wrongRuntimeFunctions, ['v4TripLifecycle']);
  assert.equal(wrongRuntime.staged, false);
});

test('Eventarc drift blocks ingress readiness and stage certification', () => {
  const triggers = V4_EVENTARC_TRIGGERS.map((expected) => (
    expected.name === 'atlas-v4-place-written'
      ? eventarcTrigger(expected, {
          destination: { cloudRun: { service: 'wrong-service', region: V4_SERVICE_REGION } },
        })
      : eventarcTrigger(expected)
  ));
  const result = buildV4DevStageVerification(canonicalInput({ eventarcTriggers: triggers }));

  assert.equal(result.eventarc.ready, false);
  assert.deepEqual(result.eventarc.invalidTriggers, ['atlas-v4-place-written']);
  assert.equal(result.readinessCandidates.eventIngressReady, false);
  assert.equal(result.staged, false);
});

test('active Firestore rules must match canonical firestore.rules exactly', () => {
  const result = buildV4DevStageVerification(canonicalInput({
    ruleset: ruleset(`${CANDIDATE_RULES}\n// drift`),
  }));

  assert.equal(result.rules.matchesCandidate, false);
  assert.notEqual(result.rules.activeSha256, result.rules.expectedSha256);
  assert.equal(result.readinessCandidates.writeRulesReady, false);
  assert.equal(result.staged, false);
});

test('idempotent cloud reads retry a transient HTTP 503 and then succeed', async () => {
  let calls = 0;
  const sleeps = [];
  const fetchFn = async () => {
    calls += 1;
    if (calls === 1) {
      return response({ ok: false, status: 503, payload: { error: { status: 'UNAVAILABLE' } } });
    }
    return response({ ok: true, status: 200, payload: { ready: true } });
  };

  const result = await requestJson('https://example.test/read', {
    token: 'test-token',
    fetchFn,
    label: 'Firebase Rules ruleset',
    sleepFn: async (milliseconds) => { sleeps.push(milliseconds); },
    randomFn: () => 0,
  });

  assert.deepEqual(result, { ready: true });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1000]);
});

test('non-transient HTTP errors still fail immediately without retry', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return response({ ok: false, status: 403, payload: { error: { status: 'PERMISSION_DENIED' } } });
  };

  await assert.rejects(
    requestJson('https://example.test/read', {
      token: 'test-token',
      fetchFn,
      label: 'Firebase Rules ruleset',
      sleepFn: async () => {},
      randomFn: () => 0,
    }),
    /Firebase Rules ruleset HTTP 403/
  );
  assert.equal(calls, 1);
});
