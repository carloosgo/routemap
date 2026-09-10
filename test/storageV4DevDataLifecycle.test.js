import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEV_DATA_LIFECYCLE_CONFIRMATION,
  DEV_DATA_LIFECYCLE_DATABASE,
  DEV_DATA_LIFECYCLE_PRODUCTION_PROJECT,
  DEV_DATA_LIFECYCLE_PROJECT,
  buildDevDataLifecyclePlan,
  parseDevDataLifecycleArgs,
} from '../scripts/runStorageV4DevDataLifecycle.mjs';
import {
  DEV_TTL_COLLECTION_GROUPS,
  DEV_TTL_POLICIES,
} from '../scripts/storageV4DevTtlManifest.mjs';

const EXPECTED_TTL_COLLECTIONS = [
  'citySearchCache',
  'placeSearchCache',
  'geocodeCache',
  'placeDetailsCache',
  'placeEnrichmentCache',
  'routeCache',
  'routeEstimateCache',
  'countryBoundaryCache',
  'googlePlaceLocationCache',
  'googleCountryPlaceIdCacheV4',
  'geoapifyBatchJobs',
  'functionRateLimits',
];

test('dev lifecycle is hard-bound to atlasmap-dev and guarded for apply', () => {
  assert.equal(DEV_DATA_LIFECYCLE_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_DATA_LIFECYCLE_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.equal(DEV_DATA_LIFECYCLE_DATABASE, '(default)');
  assert.deepEqual(parseDevDataLifecycleArgs([]), { apply: false });
  assert.throws(() => parseDevDataLifecycleArgs(['--apply']), /exige --confirm/);
  assert.deepEqual(
    parseDevDataLifecycleArgs(['--apply', `--confirm=${DEV_DATA_LIFECYCLE_CONFIRMATION}`]),
    { apply: true }
  );
  assert.throws(() => parseDevDataLifecycleArgs(['--project=atlasmap-prod']), /Argumento desconocido/);
});

test('canonical TTL manifest covers every current expiresAt lifecycle writer exactly once', () => {
  assert.deepEqual([...DEV_TTL_COLLECTION_GROUPS].sort(), [...EXPECTED_TTL_COLLECTIONS].sort());
  assert.equal(new Set(DEV_TTL_COLLECTION_GROUPS).size, DEV_TTL_COLLECTION_GROUPS.length);
  assert.equal(DEV_TTL_POLICIES.length, EXPECTED_TTL_COLLECTIONS.length);
  assert.ok(DEV_TTL_POLICIES.every(({ field }) => field === 'expiresAt'));
  assert.equal(
    DEV_TTL_POLICIES.find(({ collectionGroup }) => collectionGroup === 'functionRateLimits')?.kind,
    'internal-ephemeral-state'
  );
});

test('lifecycle plan accepts ACTIVE/CREATING and plans only missing TTL policies', () => {
  const ttlPolicies = [
    {
      collectionGroup: 'citySearchCache',
      field: 'expiresAt',
      state: 'ACTIVE',
    },
    {
      collectionGroup: 'placeSearchCache',
      field: 'expiresAt',
      state: 'CREATING',
    },
  ];
  const plan = buildDevDataLifecyclePlan({
    database: { deleteProtectionState: 'DELETE_PROTECTION_ENABLED' },
    ttlPolicies,
  });

  assert.equal(plan.deleteProtectionAlreadyEnabled, true);
  assert.equal(plan.activeTtlCount, 1);
  assert.equal(plan.configuredOrPendingTtlCount, 2);
  assert.equal(plan.ttlToEnable.length, EXPECTED_TTL_COLLECTIONS.length - 2);
  assert.equal(plan.canApply, true);
});

test('lifecycle plan fails closed on a TTL field conflict or unhealthy state', () => {
  const conflict = buildDevDataLifecyclePlan({
    ttlPolicies: [{ collectionGroup: 'routeCache', field: 'deleteAt', state: 'ACTIVE' }],
  });
  assert.equal(conflict.canApply, false);
  assert.equal(conflict.conflicts.length, 1);

  const unhealthy = buildDevDataLifecyclePlan({
    ttlPolicies: [{ collectionGroup: 'routeCache', field: 'expiresAt', state: 'NEEDS_REPAIR' }],
  });
  assert.equal(unhealthy.canApply, false);
  assert.equal(unhealthy.unhealthy.length, 1);
});

test('provider-specific caches use cacheDb while quota state remains on canonical db', async () => {
  const route = await readFile('functions/geoapifyRouteFunctions.js', 'utf8');
  const googleCountry = await readFile('functions/googleCountryPlaceIdsFunction.js', 'utf8');
  const policy = await readFile('functions/callablePolicy.js', 'utf8');

  assert.match(route, /cacheDb/);
  assert.match(route, /createSharedCache\(cacheDb/);
  assert.doesNotMatch(route, /createSharedCache\(db/);

  assert.match(googleCountry, /cacheDb/);
  assert.match(googleCountry, /createSharedCache\(cacheDb/);
  assert.doesNotMatch(googleCountry, /createSharedCache\(db/);

  assert.match(policy, /db\.collection\('functionRateLimits'\)/);
});
