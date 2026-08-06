import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';
import { config } from '../../config.js';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';

let emulatorConnected = false;

export function geoapifyCallable(name) {
  const { app } = getFirebaseServices();
  const functions = getFunctions(app, config.geoapify.functionRegion);

  if (config.firebase.useEmulators && !emulatorConnected) {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }

  return httpsCallable(functions, name);
}
