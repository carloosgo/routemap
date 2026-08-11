import { config } from '../../config.js';
import { createGateGTripRepository } from '../../infrastructure/firebase/createGateGTripRepository.js';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { createLocalStorageRepository } from '../storage/localStorageRepository.js';

export function createLocalTripRepository() {
  return createLocalStorageRepository(config.storageKey);
}

export function selectTripRepository({ uid, localRepository }) {
  if (!uid) return localRepository;

  const { db } = getFirebaseServices();
  return createGateGTripRepository({
    db,
    uid,
    rolloutConfig: config.storageV4Rollout,
  }).repository;
}
