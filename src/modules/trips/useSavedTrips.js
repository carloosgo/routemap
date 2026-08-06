import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  countLocalTrips,
  importLocalTripsIntoRepository,
  listSavedTrips,
  openSavedTrip,
  persistSavedTrip,
  removeSavedTrip,
  savedTripErrorMessage,
} from './savedTripOperations.js';
import {
  createLocalTripRepository,
  selectTripRepository,
} from './tripRepositorySelector.js';

export function useSavedTrips(user) {
  const localRepository = useMemo(() => createLocalTripRepository(), []);
  const repository = useMemo(
    () => selectTripRepository({ uid: user?.uid, localRepository }),
    [localRepository, user?.uid]
  );

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSavedTrips(repository);
      setTrips(list);
      return list;
    } catch (err) {
      setError(savedTripErrorMessage(err, 'Error al cargar viajes'));
      return [];
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        return await openSavedTrip(repository, id);
      } catch (err) {
        setError(savedTripErrorMessage(err, 'Error al abrir el viaje'));
        throw err;
      }
    },
    [repository]
  );

  const saveTrip = useCallback(
    async (trip) => {
      setError(null);
      try {
        const saved = await persistSavedTrip(repository, trip);
        await refresh();
        return saved;
      } catch (err) {
        setError(savedTripErrorMessage(err, 'Error al guardar el viaje'));
        throw err;
      }
    },
    [refresh, repository]
  );

  const deleteTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        await removeSavedTrip(repository, id);
        await refresh();
      } catch (err) {
        setError(savedTripErrorMessage(err, 'Error al eliminar el viaje'));
        throw err;
      }
    },
    [refresh, repository]
  );

  const importLocalTrips = useCallback(async () => {
    const importedCount = await importLocalTripsIntoRepository({
      uid: user?.uid,
      localRepository,
      targetRepository: repository,
    });
    await refresh();
    return importedCount;
  }, [localRepository, refresh, repository, user?.uid]);

  const getLocalTripCount = useCallback(
    () => countLocalTrips(localRepository),
    [localRepository]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    trips,
    loading,
    error,
    refresh,
    getTrip,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
    clearError,
  };
}
