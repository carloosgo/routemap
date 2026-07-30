import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { config } from '../../config.js';

let emulatorsConnected = false;

function requireFirebaseConfig() {
  const required = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];

  const missing = required.filter((key) => !config.firebase[key]);
  if (missing.length > 0) {
    throw new Error(`Falta configuración de Firebase: ${missing.join(', ')}`);
  }

  return config.firebase;
}

export function getFirebaseServices() {
  const app = getApps().length > 0 ? getApp() : initializeApp(requireFirebaseConfig());
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
