import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS,
  derivePlatformParity,
} from '../scripts/runStorageV4DevPlatformParityPreflight.mjs';

function basePlatform(ttlPolicies) {
  return derivePlatformParity({
    firestore: {
      deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
      pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
    },
    webApps: [{ displayName: 'atlas web dev', state: 'ACTIVE' }],
    hostingSites: [{ name: 'projects/atlasmap-dev/sites/atlasmap-dev' }],
    googleAuth: { enabled: true },
    authConfig: { signIn: {}, authorizedDomains: ['atlasmap-dev.web.app'] },
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
}

test('CREATING TTL is configured/pending but does not close full platform parity', () => {
  const ttlPolicies = DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS.map((collectionGroup, index) => ({
    collectionGroup,
    field: 'expiresAt',
    state: index === 0 ? 'CREATING' : 'ACTIVE',
  }));
  const parity = basePlatform(ttlPolicies);

  assert.equal(parity.configuredExpectedTtlCount, DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS.length);
  assert.equal(parity.activeExpectedTtlCount, DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS.length - 1);
  assert.deepEqual(parity.pendingTtlCollections, [DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS[0]]);
  assert.deepEqual(parity.missingTtlCollections, []);
  assert.ok(parity.gaps.includes('firestore-ttl-policies'));
  assert.equal(parity.fullPlatformParityReady, false);
});
