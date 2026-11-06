import { config } from '../../config.js';
import { createFirestoreV4AppTripRepository } from '../../infrastructure/firebase/firestoreV4AppTripRepository.js';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { createLocalStorageRepository } from '../storage/localStorageRepository.js';

export function createLocalTripRepository() {
  return createLocalStorageRepository(config.storageKey);
}

export function selectTripRepository({ uid, localRepository }) {
  if (!uid) return localRepository;

  const { db } = getFirebaseServices();
  return createFirestoreV4AppTripRepository({ db, uid });
}
