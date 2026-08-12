import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_REPOSITORY_ROLLOUT_MODE,
  planTripRepositoryRollout,
} from '../src/modules/storage-v4/tripRepositoryRolloutPlan.js';

const read100 = Object.freeze({
  enabled: true,
  killSwitch: false,
  mode: 'read',
  cohortPercent: 100,
  salt: 'gate-g-read-test',
  readRulesReady: true,
});

const pilot100 = Object.freeze({
  enabled: true,
  killSwitch: false,
  mode: 'pilot',
  cohortPercent: 100,
  salt: 'gate-g-pilot-test',
  readRulesReady: true,
  writeRulesReady: true,
  syncReady: true,
  aggregateReady: true,
  lifecycleReady: true,
  purgeReady: true,
});

test('Gate G READ elige repositorio híbrido solo para cohorte + rules ready', () => {
  const decision = planTripRepositoryRollout({ uid: 'alice', rolloutConfig: read100 });
  assert.equal(decision.repositoryMode, TRIP_REPOSITORY_ROLLOUT_MODE.HYBRID_READ);
  assert.equal(decision.rolloutMode, 'read');
  assert.equal(decision.reason, 'read-cohort');
});

test('READ sin rules ready falla cerrado a v3 aunque la cohorte esté habilitada', () => {
  const decision = planTripRepositoryRollout({
    uid: 'alice',
    rolloutConfig: { ...read100, readRulesReady: false },
  });
  assert.equal(decision.repositoryMode, TRIP_REPOSITORY_ROLLOUT_MODE.V3);
  assert.equal(decision.rolloutMode, 'read');
  assert.equal(decision.reason, 'read-rules-not-ready');
});

test('kill switch devuelve inmediatamente a v3', () => {
  const decision = planTripRepositoryRollout({
    uid: 'alice',
    rolloutConfig: { ...read100, killSwitch: true },
  });
  assert.equal(decision.repositoryMode, TRIP_REPOSITORY_ROLLOUT_MODE.V3);
  assert.equal(decision.rolloutMode, 'off');
  assert.equal(decision.reason, 'disabled');
});

test('PILOT solo selecciona writer v4 cuando todas las dependencias están listas', () => {
  const decision = planTripRepositoryRollout({ uid: 'alice', rolloutConfig: pilot100 });
  assert.equal(decision.repositoryMode, TRIP_REPOSITORY_ROLLOUT_MODE.V4_PILOT);
  assert.equal(decision.rolloutMode, 'pilot');
  assert.equal(decision.reason, 'pilot-cohort');
});

test('PILOT falla cerrado ante cualquier dependencia de escritura incompleta', () => {
  const expectedReasons = {
    readRulesReady: 'read-rules-not-ready',
    writeRulesReady: 'write-rules-not-ready',
    syncReady: 'sync-not-ready',
    aggregateReady: 'aggregate-not-ready',
    lifecycleReady: 'lifecycle-not-ready',
    purgeReady: 'purge-not-ready',
  };
  for (const [field, reason] of Object.entries(expectedReasons)) {
    const decision = planTripRepositoryRollout({
      uid: 'alice',
      rolloutConfig: { ...pilot100, [field]: false },
    });
    assert.equal(decision.repositoryMode, TRIP_REPOSITORY_ROLLOUT_MODE.V3, field);
    assert.equal(decision.rolloutMode, 'pilot', field);
    assert.equal(decision.reason, reason, field);
  }
});

test('usuario sin UID nunca puede entrar al rollout', () => {
  const decision = planTripRepositoryRollout({ uid: '', rolloutConfig: read100 });
  assert.equal(decision.repositoryMode, TRIP_REPOSITORY_ROLLOUT_MODE.V3);
  assert.equal(decision.reason, 'missing-uid');
});
