import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPhaseKProbeAuthEnvironment,
  signInForPhaseKProbe,
  signOutAfterPhaseKProbe,
} from '../src/infrastructure/firebase/phaseKProbeAuth.js';

const PROJECT = 'atlasmap-dev';

function validEnvironment(overrides = {}) {
  return {
    hostname: 'localhost',
    projectId: PROJECT,
    useEmulators: false,
    devMode: true,
    ...overrides,
  };
}

function services() {
  return {
    auth: {
      app: {
        options: {
          projectId: PROJECT,
        },
      },
    },
    googleProvider: {
      parameters: null,
      setCustomParameters(parameters) {
        this.parameters = parameters;
      },
    },
  };
}

test('Phase K auth helper only allows localhost dev against real atlasmap-dev', () => {
  assert.equal(assertPhaseKProbeAuthEnvironment(validEnvironment()), true);
  assert.throws(
    () => assertPhaseKProbeAuthEnvironment(validEnvironment({ hostname: 'atlasmap-dev.web.app' })),
    /solo puede ejecutarse desde localhost/
  );
  assert.throws(
    () => assertPhaseKProbeAuthEnvironment(validEnvironment({ projectId: 'atlasmap-prod' })),
    /bloqueado a atlasmap-dev/
  );
  assert.throws(
    () => assertPhaseKProbeAuthEnvironment(validEnvironment({ useEmulators: true })),
    /requiere Firebase real/
  );
  assert.throws(
    () => assertPhaseKProbeAuthEnvironment(validEnvironment({ devMode: false })),
    /solo esta disponible en modo development/
  );
});

test('signInForPhaseKProbe uses Google popup only on the guarded dev project', async () => {
  const firebaseServices = services();
  const calls = [];

  const result = await signInForPhaseKProbe({
    ...validEnvironment(),
    getServices: () => firebaseServices,
    signIn: async (auth, provider) => {
      calls.push({ auth, provider });
      return { user: { uid: 'probe-user-123' } };
    },
  });

  assert.deepEqual(result, {
    project: PROJECT,
    authenticated: true,
    uid: 'probe-user-123',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].auth, firebaseServices.auth);
  assert.equal(calls[0].provider, firebaseServices.googleProvider);
  assert.deepEqual(firebaseServices.googleProvider.parameters, { prompt: 'select_account' });
});

test('signOutAfterPhaseKProbe signs out the guarded atlasmap-dev session', async () => {
  const firebaseServices = services();
  const calls = [];

  const result = await signOutAfterPhaseKProbe({
    ...validEnvironment(),
    getServices: () => firebaseServices,
    signOutFn: async (auth) => {
      calls.push(auth);
    },
  });

  assert.deepEqual(result, {
    project: PROJECT,
    authenticated: false,
  });
  assert.deepEqual(calls, [firebaseServices.auth]);
});
