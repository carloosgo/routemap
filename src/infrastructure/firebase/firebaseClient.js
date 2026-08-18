import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { config } from '../../config.js';

let emulatorsConnected = false;
let appCheckInstance = null;

function requireFirebaseConfig() {
  const required = [
    'apiKey',
    'authDomain',
    'projectId',
    'messagingSenderId',
    'appId',
  ];

  const missing = required.filter((key) => !config.firebase[key]);
  if (missing.length > 0) {
    throw new Error(`Falta configuración de Firebase: ${missing.join(', ')}`);
  }

  return config.firebase;
}

function configureLocalAppCheckDebugProvider() {
  if (typeof window === 'undefined' || !import.meta.env?.DEV) return;
  const hostname = String(window.location?.hostname || '').toLowerCase();
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;

  // Firebase recomienda el Debug Provider para desarrollo local cuando App Check
  // está enforced. Nunca agregamos localhost a los dominios válidos de reCAPTCHA
  // ni incluimos un debug token en el repositorio. El SDK genera/persiste el token
  // local y el desarrollador lo registra una sola vez en App Check del proyecto dev.
  if (globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN === undefined) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

function initializeFirebaseAppCheck(app) {
  if (appCheckInstance) return appCheckInstance;
  if (
    config.firebase.useEmulators
    || !config.firebase.appCheckSiteKey
    || typeof window === 'undefined'
  ) {
    return null;
  }

  configureLocalAppCheckDebugProvider();
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(config.firebase.appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

export function getFirebaseAppCheck() {
  const app = getApps().length > 0 ? getApp() : initializeApp(requireFirebaseConfig());
  return initializeFirebaseAppCheck(app);
}

export function getFirebaseServices() {
  const app = getApps().length > 0 ? getApp() : initializeApp(requireFirebaseConfig());
  initializeFirebaseAppCheck(app);

  const auth = getAuth(app);
  const db = getFirestore(app);

  if (config.firebase.useEmulators && !emulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    emulatorsConnected = true;
  }

  return {
    app,
    auth,
    db,
    googleProvider: new GoogleAuthProvider(),
  };
}
