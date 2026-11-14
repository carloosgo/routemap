import { useCallback } from 'react';
import {
  countLocalTrips,
  importLocalTripsIntoRepository,
  persistSavedTrip,
  removeSavedTrip,
  savedTripErrorMessage,
} from './savedTripOperations.js';
import { openTripPreferringCloud } from './tripCloudSync.js';

function localOnlyState(durable = true) {
  return {
    supported: false,
    autosync: false,
    state: durable ? 'local' : 'error',
    pending: 0,
    durable,
  };
}

export function useSavedTripPersistenceActions({
  userId,
  repository,
  localRepository,
  draftStore,
  stagedDraftsRef,
  isCurrentRepository,
  refreshIfCurrent,
  setError,
}) {
  // Viaje con el que arranca la app: el último abierto en este dispositivo,
  // con la versión de la nube si aquí no quedó nada sin subir (y sin
  // internet, la copia del teléfono).
  const getActiveTripDraft = useCallback(async () => {
    const draft = await draftStore.getActive();
    const tripId = draft?.id || await repository.lastTripId?.();
    if (!tripId) return null;
    if (draft && typeof repository.getPersistenceState !== 'function') return draft;
    await Promise.resolve(repository.initialize?.()).catch(() => {});
    return openTripPreferringCloud({ repository, draftStore, tripId }).catch(() => draft || null);
  }, [draftStore, repository]);

  const getTripPersistenceState = useCallback(
    async (id) => {
      const draft = await draftStore.get(id);
      const remoteState = typeof repository.getPersistenceState === 'function'
        ? await repository.getPersistenceState(id)
        : null;

      if (remoteState?.supported === true) {
        if (remoteState.state === 'saved' && stagedDraftsRef.current.has(id)) {
          await draftStore.delete(id).catch(() => {});
          stagedDraftsRef.current.delete(id);
          return remoteState;
        }
        if (draft && remoteState.state === 'saved') {
          return {
            ...remoteState,
            autosync: true,
            state: 'local',
            recoveredDraft: true,
          };
        }
        return remoteState;
      }

      return draft ? localOnlyState(true) : {
        supported: false,
        autosync: false,
        state: 'saved',
        pending: 0,
      };
    },
    [draftStore, repository, stagedDraftsRef]
  );

  const saveTrip = useCallback(
    async (trip) => {
      setError(null);
      try {
        const saved = await persistSavedTrip(repository, trip);
        await draftStore.delete(trip.id).catch(() => {});
        stagedDraftsRef.current.delete(trip.id);
        await refreshIfCurrent();
        return saved;
      } catch (err) {
        if (isCurrentRepository()) {
          setError(savedTripErrorMessage(err, 'Error al guardar el viaje'));
        }
        throw err;
      }
    },
    [draftStore, isCurrentRepository, refreshIfCurrent, repository, setError, stagedDraftsRef]
  );

  const deleteTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        await removeSavedTrip(repository, id);
        await draftStore.delete(id).catch(() => {});
        stagedDraftsRef.current.delete(id);
        await refreshIfCurrent();
      } catch (err) {
        if (isCurrentRepository()) {
          setError(savedTripErrorMessage(err, 'Error al eliminar el viaje'));
        }
        throw err;
      }
    },
    [draftStore, isCurrentRepository, refreshIfCurrent, repository, setError, stagedDraftsRef]
  );

  const importLocalTrips = useCallback(async () => {
    const importedCount = await importLocalTripsIntoRepository({
      uid: userId,
      localRepository,
      targetRepository: repository,
    });
    await refreshIfCurrent();
    return importedCount;
  }, [localRepository, refreshIfCurrent, repository, userId]);

  const getLocalTripCount = useCallback(
    () => countLocalTrips(localRepository),
    [localRepository]
  );

  return {
    getActiveTripDraft,
    getTripPersistenceState,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
  };
}
