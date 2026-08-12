const ERROR_TRANSLATION_KEYS = Object.freeze({
  'trip/v4-sync-pending': 'saveSyncPending',
  'trip/v4-sync-busy': 'saveSyncBusy',
  'trip/v4-write-not-ready': 'saveWriteNotReady',
  'trip/v4-write-not-enabled': 'saveWriteNotReady',
});

export function savedTripErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function savedTripErrorTranslationKey(error, fallbackKey, { operation = 'save' } = {}) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'trip/save-conflict') {
    return operation === 'delete' ? 'deleteConflict' : 'saveConflict';
  }
  return ERROR_TRANSLATION_KEYS[code] || fallbackKey;
}

export async function listSavedTrips(repository) {
  return repository.list();
}

export async function openSavedTrip(repository, id) {
  return repository.get(id);
}

export async function persistSavedTrip(repository, trip) {
  return repository.save(trip);
}

export async function removeSavedTrip(repository, id) {
  await repository.remove(id);
}

export async function importLocalTripsIntoRepository({
  uid,
  localRepository,
  targetRepository,
}) {
  if (!uid) throw new Error('Inicia sesión antes de importar viajes.');

  const localTrips = await localRepository.list();
  for (const trip of localTrips) {
    await targetRepository.save(trip);
  }

  return localTrips.length;
}

export async function countLocalTrips(localRepository) {
  const localTrips = await localRepository.list();
  return localTrips.length;
}
