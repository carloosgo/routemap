import { signInWithPopup, signOut } from 'firebase/auth';
import { config } from '../../config.js';
import { getFirebaseServices } from './firebaseClient.js';

const PROJECT = 'atlasmap-dev';

function isLocalHost(hostname) {
  const value = String(hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

export function assertPhaseKProbeAuthEnvironment({
  hostname = globalThis.location?.hostname || '',
  projectId = config.firebase.projectId,
  useEmulators = config.firebase.useEmulators,
  devMode = import.meta.env?.DEV === true,
} = {}) {
  if (!devMode) {
    throw new Error('El helper de autenticacion Phase K solo esta disponible en modo development.');
  }
  if (!isLocalHost(hostname)) {
    throw new Error('El helper de autenticacion Phase K solo puede ejecutarse desde localhost.');
  }
  if (projectId !== PROJECT) {
    throw new Error(`El helper de autenticacion Phase K esta bloqueado a ${PROJECT}.`);
  }
  if (useEmulators) {
    throw new Error('El helper de autenticacion Phase K requiere Firebase real, no emuladores.');
  }
  return true;
}

export async function signInForPhaseKProbe({
  hostname,
  getServices = getFirebaseServices,
  signIn = signInWithPopup,
  devMode,
  projectId,
  useEmulators,
} = {}) {
  assertPhaseKProbeAuthEnvironment({ hostname, devMode, projectId, useEmulators });

  const { auth, googleProvider } = getServices();
  if (auth?.app?.options?.projectId !== PROJECT) {
    throw new Error(`La instancia Firebase activa no pertenece a ${PROJECT}.`);
  }

  googleProvider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signIn(auth, googleProvider);
  const uid = typeof credential?.user?.uid === 'string' ? credential.user.uid.trim() : '';
  if (!uid) throw new Error('Google Auth no devolvio un usuario Firebase valido.');

  return {
    project: PROJECT,
    authenticated: true,
    uid,
  };
}

export async function signOutAfterPhaseKProbe({
  hostname,
  getServices = getFirebaseServices,
  signOutFn = signOut,
  devMode,
  projectId,
  useEmulators,
} = {}) {
  assertPhaseKProbeAuthEnvironment({ hostname, devMode, projectId, useEmulators });

  const { auth } = getServices();
  if (auth?.app?.options?.projectId !== PROJECT) {
    throw new Error(`La instancia Firebase activa no pertenece a ${PROJECT}.`);
  }

  await signOutFn(auth);
  return {
    project: PROJECT,
    authenticated: false,
  };
}
