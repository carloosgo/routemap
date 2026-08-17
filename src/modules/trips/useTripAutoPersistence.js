import { useCallback, useEffect, useRef, useState } from 'react';

export const TRIP_PERSISTENCE_STATE = Object.freeze({
  SAVED: 'saved',
  PENDING: 'pending',
  LOCAL: 'local',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
  ERROR: 'error',
});

const DEFAULT_LOCAL_DEBOUNCE_MS = 350;
const DEFAULT_STATUS_POLL_MS = 700;

function normalizedState(value, fallback = TRIP_PERSISTENCE_STATE.LOCAL) {
  return Object.values(TRIP_PERSISTENCE_STATE).includes(value) ? value : fallback;
}

function errorState(error) {
  return error?.code === 'trip/save-conflict'
    ? TRIP_PERSISTENCE_STATE.CONFLICT
    : TRIP_PERSISTENCE_STATE.ERROR;
}

/**
 * Product bridge from React edits to durable local drafts and, when the active
 * repository is a writable v4 trip, to the existing incremental sync scheduler.
 *
 * The 350ms timer is only a local IndexedDB boundary. Firestore remains behind
 * the v4 runtime's own ~3s debounce/coalescing policy.
 */
export function useTripAutoPersistence({
  trip,
  stageTrip,
  getTripPersistenceState,
  canRemoteSync = true,
  localDebounceMs = DEFAULT_LOCAL_DEBOUNCE_MS,
  statusPollMs = DEFAULT_STATUS_POLL_MS,
} = {}) {
  const [state, setState] = useState(TRIP_PERSISTENCE_STATE.SAVED);
  const [autosyncActive, setAutosyncActive] = useState(false);
  const latestTripRef = useRef(trip);
  const canRemoteSyncRef = useRef(Boolean(canRemoteSync));
  const markerRef = useRef(null);
  const stageTimerRef = useRef(null);
  const explicitSaveRef = useRef(false);

  latestTripRef.current = trip;
  canRemoteSyncRef.current = Boolean(canRemoteSync);

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current != null) {
      globalThis.clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  const stageCurrent = useCallback(async ({ remote = canRemoteSyncRef.current } = {}) => {
    const current = latestTripRef.current;
    if (!current?.id || typeof stageTrip !== 'function') return null;
    try {
      const result = await stageTrip(current, { remote });
      if (explicitSaveRef.current) return result;
      const nextState = result?.autosync === true
        ? normalizedState(result.state, TRIP_PERSISTENCE_STATE.PENDING)
        : (result?.state === 'saved'
            ? TRIP_PERSISTENCE_STATE.SAVED
            : TRIP_PERSISTENCE_STATE.LOCAL);
      setState(nextState);
      setAutosyncActive(result?.autosync === true && nextState !== TRIP_PERSISTENCE_STATE.SAVED);
      return result;
    } catch (error) {
      if (!explicitSaveRef.current) {
        setState(errorState(error));
        setAutosyncActive(false);
      }
      throw error;
    }
  }, [stageTrip]);

  const scheduleStage = useCallback(() => {
    clearStageTimer();
    stageTimerRef.current = globalThis.setTimeout(() => {
      stageTimerRef.current = null;
      void stageCurrent().catch(() => {});
    }, localDebounceMs);
  }, [clearStageTimer, localDebounceMs, stageCurrent]);

  useEffect(() => {
    const id = trip?.id || '';
    const revision = trip?.updatedAt || '';
    if (!id) return undefined;
    const previous = markerRef.current;
    markerRef.current = { id, revision };

    if (!previous || previous.id !== id) {
      clearStageTimer();
      explicitSaveRef.current = false;
      setAutosyncActive(false);
      let cancelled = false;
      if (typeof getTripPersistenceState === 'function') {
        Promise.resolve(getTripPersistenceState(id)).then((result) => {
          if (cancelled) return;
          const nextState = normalizedState(result?.state, TRIP_PERSISTENCE_STATE.SAVED);
          setState(nextState === 'manual' ? TRIP_PERSISTENCE_STATE.SAVED : nextState);
          const shouldResume = result?.recoveredDraft === true;
          setAutosyncActive(result?.autosync === true && nextState !== TRIP_PERSISTENCE_STATE.SAVED);
          if (shouldResume) scheduleStage();
        }).catch(() => {
          if (!cancelled) setState(TRIP_PERSISTENCE_STATE.ERROR);
        });
      } else {
        setState(TRIP_PERSISTENCE_STATE.SAVED);
      }
      return () => {
        cancelled = true;
      };
    }

    if (previous.revision === revision || explicitSaveRef.current) return undefined;
    setState(TRIP_PERSISTENCE_STATE.PENDING);
    scheduleStage();
    return clearStageTimer;
  }, [
    clearStageTimer,
    getTripPersistenceState,
    scheduleStage,
    trip?.id,
    trip?.updatedAt,
  ]);

  useEffect(() => {
    if (
      !autosyncActive
      || !trip?.id
      || typeof getTripPersistenceState !== 'function'
      || explicitSaveRef.current
    ) {
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getTripPersistenceState(trip.id);
        if (cancelled || explicitSaveRef.current) return;
        const nextState = normalizedState(result?.state, TRIP_PERSISTENCE_STATE.LOCAL);
        setState(nextState);
        if (
          nextState === TRIP_PERSISTENCE_STATE.SAVED
          || nextState === TRIP_PERSISTENCE_STATE.CONFLICT
          || nextState === TRIP_PERSISTENCE_STATE.ERROR
        ) {
          setAutosyncActive(false);
        }
      } catch {
        if (!cancelled && !explicitSaveRef.current) {
          setState(TRIP_PERSISTENCE_STATE.ERROR);
          setAutosyncActive(false);
        }
      }
    };

    void poll();
    const handle = globalThis.setInterval(poll, statusPollMs);
    return () => {
      cancelled = true;
      globalThis.clearInterval(handle);
    };
  }, [autosyncActive, getTripPersistenceState, statusPollMs, trip?.id]);

  useEffect(() => () => clearStageTimer(), [clearStageTimer]);

  const persistLocalNow = useCallback(async () => {
    clearStageTimer();
    return stageCurrent({ remote: false });
  }, [clearStageTimer, stageCurrent]);

  const markSaving = useCallback(() => {
    clearStageTimer();
    explicitSaveRef.current = true;
    setAutosyncActive(false);
    setState(TRIP_PERSISTENCE_STATE.SYNCING);
  }, [clearStageTimer]);

  const markSaved = useCallback(() => {
    explicitSaveRef.current = false;
    setAutosyncActive(false);
    setState(TRIP_PERSISTENCE_STATE.SAVED);
  }, []);

  const markSaveError = useCallback((error) => {
    explicitSaveRef.current = false;
    setAutosyncActive(false);
    setState(errorState(error));
  }, []);

  return {
    state,
    persistLocalNow,
    markSaving,
    markSaved,
    markSaveError,
  };
}
