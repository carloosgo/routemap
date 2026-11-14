import { config } from '../../config.js';
import { createFirestoreV4AppTripRepository } from '../../infrastructure/firebase/firestoreV4AppTripRepository.js';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { createLocalStorageRepository } from '../storage/localStorageRepository.js';
import { createOfflineTripRepository } from './offlineTripRepository.js';
import { createOfflineTripStore } from './offlineTripStore.js';

export function createLocalTripRepository() {
  return createLocalStorageRepository(config.storageKey);
}

export function selectTripRepository({ uid, localRepository }) {
  if (!uid) return localRepository;

  const { db } = getFirebaseServices();
  // Con copia en el teléfono para usar los viajes sin internet.
  return createOfflineTripRepository({
    repository: createFirestoreV4AppTripRepository({ db, uid }),
    store: createOfflineTripStore({ ownerId: uid }),
  });
}
