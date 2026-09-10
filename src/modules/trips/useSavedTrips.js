import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  listSavedTrips,
  openSavedTrip,
  savedTripErrorMessage,
} from './savedTripOperations.js';
import {
  createLocalTripRepository,
  selectTripRepository,
} from './tripRepositorySelector.js';
import { createTripDraftStore, tripDraftScopeId } from './tripDraftStore.js';
import { useSavedTripPersistenceActions } from './useSavedTripPersistenceActions.js';

function localOnlyState(durable = true) {
  return {
    supported: false,
    autosync: false,
    state: durable ? 'local' : 'error',
    pending: 0,
    durable,
  };
}

export function useSavedTrips(user) {
  const localRepository = useMemo(() => createLocalTripRepository(), []);
  const draftStore = useMemo(
    () => createTripDraftStore({ scopeId: tripDraftScopeId(user?.uid || 'anonymous') }),
    [user?.uid]
  );
  const repository = useMemo(
    () => selectTripRepository({
      uid: user?.uid,
      localRepository,
    }),
    [localRepository, user?.uid]
  );
  const currentRepositoryRef = useRef(repository);
  const refreshVersionRef = useRef(0);
  const stagedDraftsRef = useRef(new Set());
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
      await repository.initialize?.();
      const list = await listSavedTrips(repository);
      if (
        refreshVersion === refreshVersionRef.current
        && currentRepositoryRef.current === repository
      ) setTrips(list);
      return list;
    } catch (err) {
      if (
        refreshVersion === refreshVersionRef.current
        && currentRepositoryRef.current === repository
      ) setError(savedTripErrorMessage(err, 'Error al cargar viajes'));
      return [];
    } finally {
      if (
        refreshVersion === refreshVersionRef.current
        && currentRepositoryRef.current === repository
      ) setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    refresh();
    return () => { refreshVersionRef.current += 1; };
  }, [refresh]);

  useEffect(() => () => {
    try {
      const result = repository.close?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Cleanup best-effort: un fallo al cerrar recursos no debe romper React unmount.
    }
  }, [repository]);

  useEffect(() => () => {
    void draftStore.close().catch(() => {});
  }, [draftStore]);

  const getTrip = useCallback(async (id) => {
    setError(null);
    try {
      const storedTrip = await openSavedTrip(repository, id);
      const draft = await draftStore.get(id);
      return draft || storedTrip;
    } catch (err) {
      if (isCurrentRepository()) {
        setError(savedTripErrorMessage(err, 'Error al abrir el viaje'));
      }
      throw err;
    }
  }, [draftStore, isCurrentRepository, repository]);

  const stageTrip = useCallback(async (trip, { remote = true } = {}) => {
    const localDraft = await draftStore.put(trip);
    if (!remote || typeof repository.stage !== 'function') {
      return localOnlyState(localDraft.durable);
    }

    const staged = await repository.stage(trip);
    if (staged?.autosync === true) {
      stagedDraftsRef.current.add(trip.id);
      if (staged.state === 'saved') {
        await draftStore.delete(trip.id).catch(() => {});
        stagedDraftsRef.current.delete(trip.id);
      }
    }
    return {
      ...localOnlyState(localDraft.durable),
      ...(staged || {}),
      durable: localDraft.durable,
    };
  }, [draftStore, repository]);

  const refreshIfCurrent = useCallback(async () => {
    if (isCurrentRepository()) await refresh();
  }, [isCurrentRepository, refresh]);

  const {
    getActiveTripDraft,
    getTripPersistenceState,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
  } = useSavedTripPersistenceActions({
    userId: user?.uid,
    repository,
    localRepository,
    draftStore,
    stagedDraftsRef,
    isCurrentRepository,
    refreshIfCurrent,
    setError,
  });

  const clearError = useCallback(() => setError(null), []);

  return {
    trips,
    loading,
    error,
    refresh,
    getTrip,
    getActiveTripDraft,
    stageTrip,
    getTripPersistenceState,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
    clearError,
  };
}
