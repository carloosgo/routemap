import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS,
  DEV_PLATFORM_PRODUCTION_PROJECT,
  DEV_PLATFORM_PROJECT,
  derivePlatformParity,
  parseDevPlatformParityArgs,
  summarizeTtlPolicies,
} from '../scripts/runStorageV4DevPlatformParityPreflight.mjs';

test('platform parity inventory is hard-bound to dev and read-only', () => {
  assert.equal(DEV_PLATFORM_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_PLATFORM_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.deepEqual(parseDevPlatformParityArgs([]), {});
  assert.throws(() => parseDevPlatformParityArgs(['--apply']), /read-only/);
  assert.throws(() => parseDevPlatformParityArgs(['--confirm=ANY']), /read-only/);
});

test('TTL policy summarizer extracts collection group, field and state', () => {
  const policies = summarizeTtlPolicies([
    {
      name: 'projects/atlasmap-dev/databases/(default)/collectionGroups/routeCache/fields/expiresAt',
      ttlConfig: { state: 'ACTIVE' },
    },
  ]);
  assert.deepEqual(policies, [{ collectionGroup: 'routeCache', field: 'expiresAt', state: 'ACTIVE' }]);
});

test('derivePlatformParity reports no gap for a complete production-like dev platform', () => {
  const ttlPolicies = DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS.map((collectionGroup) => ({
    collectionGroup,
    field: 'expiresAt',
    state: 'ACTIVE',
  }));
  const parity = derivePlatformParity({
    firestore: {
      deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
      pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
    },
    webApps: [{ displayName: 'AtlasMap Web', state: 'ACTIVE' }],
    hostingSites: [{ name: 'projects/atlasmap-dev/sites/atlasmap-dev', type: 'DEFAULT_SITE', defaultUrl: 'https://atlasmap-dev.web.app' }],
    googleAuth: { enabled: true },
    authConfig: { signIn: {}, authorizedDomains: ['localhost', 'atlasmap-dev.web.app'] },
    services: {
      firebaseHosting: true,
      firebaseAppCheck: true,
      recaptchaEnterprise: true,
      secretManager: true,
      remoteConfig: true,
      identityToolkit: true,
    },
    appCheckConfigs: [{ siteKeyConfigured: true }],
    ttlPolicies,
  });
  assert.equal(parity.fullPlatformParityReady, true);
  assert.deepEqual(parity.gaps, []);
  assert.equal(parity.activeExpectedTtlCount, DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS.length);
});

test('derivePlatformParity exposes Hosting, App Check and TTL gaps without pretending they are configured', () => {
  const parity = derivePlatformParity({
    firestore: {
      deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
      pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
    },
    webApps: [{ displayName: 'AtlasMap Web', state: 'ACTIVE' }],
    googleAuth: { enabled: true },
    authConfig: { signIn: {}, authorizedDomains: ['localhost'] },
    services: {
      firebaseHosting: false,
      firebaseAppCheck: false,
      recaptchaEnterprise: false,
      secretManager: true,
      remoteConfig: true,
      identityToolkit: true,
    },
    appCheckConfigs: [],
    ttlPolicies: [],
  });
  assert.equal(parity.fullPlatformParityReady, false);
  assert.ok(parity.gaps.includes('firebase-hosting-preprod-url'));
  assert.ok(parity.gaps.includes('firebase-app-check-api'));
  assert.ok(parity.gaps.includes('recaptcha-enterprise-api'));
  assert.ok(parity.gaps.includes('app-check-registration'));
  assert.ok(parity.gaps.includes('firestore-ttl-policies'));
});
