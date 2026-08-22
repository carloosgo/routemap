import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STORAGE_V4_ROLLOUT,
  STORAGE_V4_ROLLOUT_MODE,
  evaluateStorageV4Rollout,
  normalizeStorageV4Rollout,
  stableRolloutBucket,
} from '../src/modules/storage-v4/rolloutPolicy.js';

test('rollout v4 falla cerrado por defecto ante config ausente o inválida', () => {
  assert.deepEqual(normalizeStorageV4Rollout(), DEFAULT_STORAGE_V4_ROLLOUT);
  assert.deepEqual(normalizeStorageV4Rollout(null), DEFAULT_STORAGE_V4_ROLLOUT);
  assert.equal(evaluateStorageV4Rollout({ uid: 'alice' }).enabled, false);

  const malformed = normalizeStorageV4Rollout({
    enabled: true,
    killSwitch: false,
    mode: 'future-mode',
    cohortPercent: 500,
  });
  assert.equal(malformed.enabled, false);
  assert.equal(malformed.killSwitch, true);
  assert.equal(malformed.mode, STORAGE_V4_ROLLOUT_MODE.OFF);
  assert.equal(malformed.cohortPercent, 0);
});

test('kill switch prevalece aunque el flag, modo y cohorte estén habilitados', () => {
  const result = evaluateStorageV4Rollout({
    uid: 'alice',
    config: {
      enabled: true,
      killSwitch: true,
      mode: STORAGE_V4_ROLLOUT_MODE.PILOT,
      cohortPercent: 100,
    },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.mode, STORAGE_V4_ROLLOUT_MODE.OFF);
  assert.equal(result.reason, 'disabled');
});

test('config debe desactivar kill switch explícitamente; omitirlo nunca activa rollout', () => {
  const omitted = evaluateStorageV4Rollout({
    uid: 'alice',
    config: {
      enabled: true,
      mode: STORAGE_V4_ROLLOUT_MODE.READ,
      cohortPercent: 100,
    },
  });
  assert.equal(omitted.enabled, false);

  const explicit = evaluateStorageV4Rollout({
    uid: 'alice',
    config: {
      enabled: true,
      killSwitch: false,
      mode: STORAGE_V4_ROLLOUT_MODE.READ,
      cohortPercent: 100,
    },
  });
  assert.equal(explicit.enabled, true);
  assert.equal(explicit.mode, STORAGE_V4_ROLLOUT_MODE.READ);
});

test('UID vacío nunca entra en una cohorte aunque la política sea 100%', () => {
  const config = {
    enabled: true,
    killSwitch: false,
    mode: STORAGE_V4_ROLLOUT_MODE.READ,
    cohortPercent: 100,
  };
  for (const uid of [undefined, null, '', '   ']) {
    const result = evaluateStorageV4Rollout({ uid, config });
    assert.equal(result.enabled, false);
    assert.equal(result.bucket, null);
    assert.equal(result.reason, 'missing-uid');
  }
});

test('0% excluye a todos y 100% incluye a cualquier UID válido', () => {
  const base = {
    enabled: true,
    killSwitch: false,
    mode: STORAGE_V4_ROLLOUT_MODE.READ,
  };
  for (const uid of ['alice', 'bob', 'carol', 'user-50000']) {
    assert.equal(evaluateStorageV4Rollout({
      uid,
      config: { ...base, cohortPercent: 0 },
    }).enabled, false);
    assert.equal(evaluateStorageV4Rollout({
      uid,
      config: { ...base, cohortPercent: 100 },
    }).enabled, true);
  }
});

test('asignación por UID es determinista entre evaluaciones y no usa azar local', () => {
  const first = stableRolloutBucket('alice', 'rollout-a');
  const second = stableRolloutBucket('alice', 'rollout-a');
  assert.equal(first, second);
  assert.ok(Number.isInteger(first));
  assert.ok(first >= 0 && first < 10_000);

  const config = {
    enabled: true,
    killSwitch: false,
    mode: STORAGE_V4_ROLLOUT_MODE.PILOT,
    cohortPercent: 37.25,
    salt: 'rollout-a',
  };
  assert.deepEqual(
    evaluateStorageV4Rollout({ uid: 'alice', config }),
    evaluateStorageV4Rollout({ uid: 'alice', config })
  );
});

test('salt permite una cohorte independiente sin depender del dispositivo', () => {
  const users = Array.from({ length: 200 }, (_, index) => `user-${index}`);
  const changed = users.some((uid) =>
    stableRolloutBucket(uid, 'cohort-a') !== stableRolloutBucket(uid, 'cohort-b')
  );
  assert.equal(changed, true);
});

test('porcentaje decimal usa una frontera estable de 10,000 buckets', () => {
  const policy = normalizeStorageV4Rollout({
    enabled: true,
    killSwitch: false,
    mode: STORAGE_V4_ROLLOUT_MODE.READ,
    cohortPercent: 12.34,
    salt: 'decimal-boundary',
  });
  assert.equal(policy.cohortPercent, 12.34);

  const threshold = 1234;
  let inside = null;
  let outside = null;
  for (let index = 0; index < 50_000 && (!inside || !outside); index += 1) {
    const uid = `candidate-${index}`;
    const bucket = stableRolloutBucket(uid, policy.salt);
    if (bucket < threshold && !inside) inside = uid;
    if (bucket >= threshold && !outside) outside = uid;
  }
  assert.ok(inside);
  assert.ok(outside);
  assert.equal(evaluateStorageV4Rollout({ uid: inside, config: policy }).enabled, true);
  assert.equal(evaluateStorageV4Rollout({ uid: outside, config: policy }).enabled, false);
});

test('modo pilot solo es una decisión de elegibilidad; el selector productivo sigue fuera de este modelo', async () => {
  const result = evaluateStorageV4Rollout({
    uid: 'pilot-user',
    config: {
      enabled: true,
      killSwitch: false,
      mode: STORAGE_V4_ROLLOUT_MODE.PILOT,
      cohortPercent: 100,
    },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.mode, STORAGE_V4_ROLLOUT_MODE.PILOT);
  assert.equal('repository' in result, false);
  assert.equal('canWrite' in result, false);
});
