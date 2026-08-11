import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { useGateGRolloutConfig } from '../../infrastructure/firebase/useGateGRolloutConfig.js';
import { useGateGRolloutTelemetry } from '../../infrastructure/firebase/useGateGRolloutTelemetry.js';

export function useSavedTrips(user) {
  const localRepository = useMemo(() => createLocalTripRepository(), []);
  const rolloutConfig = useGateGRolloutConfig();
  const emitTelemetry = useGateGRolloutTelemetry();
  const repository = useMemo(
    () => selectTripRepository({
      uid: user?.uid,
      localRepository,
      rolloutConfig,
      emitTelemetry,
    }),
    [emitTelemetry, localRepository, rolloutConfig, user?.uid]
  );
  const currentRepositoryRef = useRef(repository);
  const refreshVersionRef = useRef(0);
  currentRepositoryRef.current = repository;

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isCurrentRepository = useCallback(
    () => currentRepositoryRef.current === repository,
    [repository]
  );

  const refresh = useCallback(async () => {
    const refreshVersion = ++refreshVersionRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await listSavedTrips(repository);
      if (
        refreshVersion === refreshVersionRef.current
        && currentRepositoryRef.current === repository
      ) {
        setTrips(list);
      }
      return list;
    } catch (err) {
      if (
        refreshVersion === refreshVersionRef.current
        && currentRepositoryRef.current === repository
      ) {
        setError(savedTripErrorMessage(err, 'Error al cargar viajes'));
      }
      return [];
    } finally {
      if (
        refreshVersion === refreshVersionRef.current
        && currentRepositoryRef.current === repository
      ) {
        setLoading(false);
      }
    }
  }, [repository]);

  useEffect(() => {
    refresh();
    return () => {
      refreshVersionRef.current += 1;
    };
  }, [refresh]);

  const getTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        return await openSavedTrip(repository, id);
      } catch (err) {
        if (isCurrentRepository()) {
          setError(savedTripErrorMessage(err, 'Error al abrir el viaje'));
        }
        throw err;
      }
    },
    [isCurrentRepository, repository]
  );

  const saveTrip = useCallback(
    async (trip) => {
      setError(null);
      try {
        const saved = await persistSavedTrip(repository, trip);
        if (isCurrentRepository()) await refresh();
        return saved;
      } catch (err) {
        if (isCurrentRepository()) {
          setError(savedTripErrorMessage(err, 'Error al guardar el viaje'));
        }
        throw err;
      }
    },
    [isCurrentRepository, refresh, repository]
  );

  const deleteTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        await removeSavedTrip(repository, id);
        if (isCurrentRepository()) await refresh();
      } catch (err) {
        if (isCurrentRepository()) {
          setError(savedTripErrorMessage(err, 'Error al eliminar el viaje'));
        }
        throw err;
      }
    },
    [isCurrentRepository, refresh, repository]
  );

  const importLocalTrips = useCallback(async () => {
    const importedCount = await importLocalTripsIntoRepository({
      uid: user?.uid,
      localRepository,
      targetRepository: repository,
    });
    if (isCurrentRepository()) await refresh();
    return importedCount;
  }, [isCurrentRepository, localRepository, refresh, repository, user?.uid]);

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
