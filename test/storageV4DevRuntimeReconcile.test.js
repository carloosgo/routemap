import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDevRuntimeReconcilePlan,
  DEV_RUNTIME_RECONCILE_CONFIRMATION,
  eventarcCreateArgs,
  parseDevRuntimeReconcileArgs,
} from '../scripts/runStorageV4DevRuntimeReconcile.mjs';

function driftFixture(overrides = {}) {
  const base = {
    project: 'atlasmap-dev',
    staged: false,
    functionsReady: true,
    eventarc: {
      destinationCloudRunService: 'v4firestoreeventingress',
      missingTriggers: ['atlas-v4-trip-written'],
      invalidTriggers: [],
      triggers: [
        { valid: false, reason: 'missing' },
        {
          valid: true,
          serviceAccount: 'atlas-v4-eventarc@atlasmap-dev.iam.gserviceaccount.com',
        },
        {
          valid: true,
          serviceAccount: 'atlas-v4-eventarc@atlasmap-dev.iam.gserviceaccount.com',
        },
      ],
    },
    rules: {
      matchesCandidate: false,
      expectedSha256: 'expected-rules-hash',
      activeSha256: 'active-rules-hash',
    },
  };
  return {
    ...base,
    ...overrides,
    eventarc: { ...base.eventarc, ...(overrides.eventarc || {}) },
    rules: { ...base.rules, ...(overrides.rules || {}) },
  };
}

test('buildDevRuntimeReconcilePlan narrows current dev drift to root trigger and rules', () => {
  const plan = buildDevRuntimeReconcilePlan(driftFixture());
  assert.equal(plan.project, 'atlasmap-dev');
  assert.equal(plan.productionProject, 'atlasmap-prod');
  assert.equal(plan.canApply, true);
  assert.equal(plan.touchesProduction, false);
  assert.equal(plan.deploysFunctions, false);
  assert.equal(plan.deploysHosting, false);
  assert.equal(plan.mutatesIam, false);
  assert.equal(plan.mutatesApplicationData, false);
  assert.deepEqual(plan.missingEventarcTriggers, ['atlas-v4-trip-written']);
  assert.equal(plan.actions.length, 2);

  const trigger = plan.actions[0];
  assert.equal(trigger.type, 'create-eventarc-trigger');
  assert.equal(trigger.name, 'atlas-v4-trip-written');
  assert.equal(trigger.location, 'northamerica-south1');
  assert.equal(trigger.destinationService, 'v4firestoreeventingress');
  assert.equal(trigger.destinationRegion, 'us-central1');
  assert.equal(trigger.document, 'users/{userId}/trips/{tripId}');
  assert.equal(trigger.serviceAccount, 'atlas-v4-eventarc@atlasmap-dev.iam.gserviceaccount.com');

  assert.equal(plan.actions[1].type, 'deploy-firestore-rules');
  assert.equal(plan.actions[1].expectedSha256, 'expected-rules-hash');
  assert.equal(plan.actions[1].activeSha256, 'active-rules-hash');
});

test('eventarcCreateArgs is target-locked to atlasmap-dev and canonical Firestore filters', () => {
  const [action] = buildDevRuntimeReconcilePlan(driftFixture()).actions;
  const args = eventarcCreateArgs(action);
  assert.deepEqual(args.slice(0, 4), ['eventarc', 'triggers', 'create', 'atlas-v4-trip-written']);
  assert.ok(args.includes('--location=northamerica-south1'));
  assert.ok(args.includes('--destination-run-service=v4firestoreeventingress'));
  assert.ok(args.includes('--destination-run-region=us-central1'));
  assert.ok(args.includes('--event-filters=type=google.cloud.firestore.document.v1.written'));
  assert.ok(args.includes('--event-filters=database=(default)'));
  assert.ok(args.includes('--event-filters-path-pattern=document=users/{userId}/trips/{tripId}'));
  assert.ok(args.includes('--event-data-content-type=application/protobuf'));
  assert.ok(args.includes('--project=atlasmap-dev'));
  assert.equal(args.some((value) => value.includes('atlasmap-prod')), false);
});

test('reconciliation is a no-op when dev is already staged', () => {
  const plan = buildDevRuntimeReconcilePlan(driftFixture({
    staged: true,
    eventarc: { missingTriggers: [] },
    rules: { matchesCandidate: true },
  }));
  assert.equal(plan.canApply, true);
  assert.equal(plan.actions.length, 0);
  assert.equal(plan.mutatesCloudWhenApplied, false);
});

test('reconciliation refuses to replace invalid existing triggers or repair Functions blindly', () => {
  const invalidTriggerPlan = buildDevRuntimeReconcilePlan(driftFixture({
    eventarc: {
      missingTriggers: [],
      invalidTriggers: ['atlas-v4-trip-written'],
    },
  }));
  assert.equal(invalidTriggerPlan.canApply, false);
  assert.ok(invalidTriggerPlan.blockers.includes('existing-eventarc-trigger-invalid'));
  assert.equal(invalidTriggerPlan.actions.length, 0);

  const functionsPlan = buildDevRuntimeReconcilePlan(driftFixture({ functionsReady: false }));
  assert.equal(functionsPlan.canApply, false);
  assert.ok(functionsPlan.blockers.includes('canonical-functions-not-ready'));
  assert.equal(functionsPlan.actions.length, 0);
});

test('apply requires an explicit dev-only confirmation token', () => {
  assert.deepEqual(parseDevRuntimeReconcileArgs([]), { apply: false, confirmation: '' });
  assert.throws(() => parseDevRuntimeReconcileArgs(['--apply']), /--apply exige --confirm=/);
  assert.deepEqual(
    parseDevRuntimeReconcileArgs([
      '--apply',
      `--confirm=${DEV_RUNTIME_RECONCILE_CONFIRMATION}`,
    ]),
    { apply: true, confirmation: DEV_RUNTIME_RECONCILE_CONFIRMATION }
  );
});
