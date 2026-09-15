// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_BUSINESS_TESTS, buildVerificationPlan } from '../scripts/runChangedTests.mjs';

const impactedBehavior = (path = 'test/someUiBehavior.test.js') => [{
  path,
  category: 'behavior',
  changedReferences: ['src/components/SegmentForm.jsx'],
}];

test('CSS usa regresion dirigida mas el nucleo de negocio', () => {
  const plan = buildVerificationPlan(['src/app/FloatingEditor.css'], []);
  assert.equal(plan.mode, 'targeted');
  assert.deepEqual(plan.tests, [...CORE_BUSINESS_TESTS].sort());
});

test('UI con cobertura ejecuta impactados y nucleo de negocio', () => {
  const impacted = impactedBehavior();
  const plan = buildVerificationPlan(['src/components/SegmentForm.jsx'], impacted);
  assert.equal(plan.mode, 'targeted');
  assert.ok(plan.tests.includes(impacted[0].path));
  for (const core of CORE_BUSINESS_TESTS) assert.ok(plan.tests.includes(core));
});

test('UI sin ninguna prueba relacionada escala a regresion completa', () => {
  const plan = buildVerificationPlan(['src/components/UnknownPanel.jsx'], []);
  assert.equal(plan.mode, 'full');
});

test('modulos de negocio siempre escalan a regresion completa', () => {
  for (const path of [
    'src/modules/trips/tripReducer.js',
    'src/modules/expenses/expenseModel.js',
    'src/modules/map/routeMapModel.js',
    'src/modules/storage-v4/v4Writer.js',
  ]) {
    assert.equal(buildVerificationPlan([path], impactedBehavior()).mode, 'full', path);
  }
});

test('infraestructura, Functions, Rules y configuracion siempre escalan', () => {
  for (const path of [
    'src/infrastructure/firebase/firebaseClient.js',
    'functions/index.js',
    'firestore.rules',
    'firebase.json',
    'src/config.js',
    'package.json',
    '.github/workflows/quality.yml',
  ]) {
    assert.equal(buildVerificationPlan([path], []).mode, 'full', path);
  }
});

test('una prueba de integracion impactada obliga regresion completa', () => {
  const plan = buildVerificationPlan(['src/components/SegmentForm.jsx'], [{
    path: 'firebase-tests/firestore.v4.rules.spec.js',
    category: 'integration',
    changedReferences: ['src/components/SegmentForm.jsx'],
  }]);
  assert.equal(plan.mode, 'full');
});

test('codigo ejecutable no clasificado falla de forma conservadora', () => {
  assert.equal(buildVerificationPlan(['src/experimental/newLogic.js'], []).mode, 'full');
});

test('documentacion pura no dispara regresion de negocio innecesaria', () => {
  const plan = buildVerificationPlan(['docs/TESTING_STRATEGY.md'], []);
  assert.equal(plan.mode, 'lightweight');
  assert.deepEqual(plan.tests, []);
});

test('si no puede determinar cambios escala a suite completa', () => {
  assert.equal(buildVerificationPlan([], []).mode, 'full');
});
