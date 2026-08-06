import { useState, useEffect, useCallback, useMemo } from 'react';
import { config } from '../../config.js';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { createFirestoreTripRepository } from '../../infrastructure/firebase/firestoreTripRepository.js';
import { createLocalStorageRepository } from '../storage/localStorageRepository.js';

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useSavedTrips(user) {
  const localRepository = useMemo(
    () => createLocalStorageRepository(config.storageKey),
    []
  );

  const repository = useMemo(() => {
    if (!user?.uid) return localRepository;
    const { db } = getFirebaseServices();
    return createFirestoreTripRepository({ db, uid: user.uid });
  }, [localRepository, user?.uid]);

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await repository.list();
      setTrips(list);
      return list;
    } catch (err) {
      setError(errorMessage(err, 'Error al cargar viajes'));
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
        return await repository.get(id);
      } catch (err) {
        setError(errorMessage(err, 'Error al abrir el viaje'));
        throw err;
      }
    },
    [repository]
  );

  const saveTrip = useCallback(
    async (trip) => {
      setError(null);
      try {
        const saved = await repository.save(trip);
        await refresh();
        return saved;
      } catch (err) {
        setError(errorMessage(err, 'Error al guardar el viaje'));
        throw err;
      }
    },
    [refresh, repository]
  );

  const deleteTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        await repository.remove(id);
        await refresh();
      } catch (err) {
        setError(errorMessage(err, 'Error al eliminar el viaje'));
        throw err;
      }
    },
    [refresh, repository]
  );

  const importLocalTrips = useCallback(async () => {
    if (!user?.uid) throw new Error('Inicia sesión antes de importar viajes.');
    const localTrips = await localRepository.list();
    for (const trip of localTrips) await repository.save(trip);
    await refresh();
    return localTrips.length;
  }, [localRepository, refresh, repository, user?.uid]);

  const getLocalTripCount = useCallback(async () => {
    const localTrips = await localRepository.list();
    return localTrips.length;
  }, [localRepository]);

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
