import { config } from '../../config.js';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { createFirestoreTripRepository } from '../../infrastructure/firebase/firestoreTripRepository.js';
import { createLocalStorageRepository } from '../storage/localStorageRepository.js';

export function createLocalTripRepository() {
  return createLocalStorageRepository(config.storageKey);
}

export function selectTripRepository({ uid, localRepository }) {
  if (!uid) return localRepository;

  const { db } = getFirebaseServices();
  return createFirestoreTripRepository({ db, uid });
}
