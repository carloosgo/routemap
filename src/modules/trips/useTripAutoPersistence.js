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

function stagedState(result) {
  if (result?.durable === false) return TRIP_PERSISTENCE_STATE.ERROR;
  if (result?.autosync === true) {
    return normalizedState(result.state, TRIP_PERSISTENCE_STATE.PENDING);
  }
  return result?.state === 'saved'
    ? TRIP_PERSISTENCE_STATE.SAVED
    : TRIP_PERSISTENCE_STATE.LOCAL;
}

export function isTripEditTransition(previous, trip) {
  return Boolean(
    previous
    && trip?.id
    && previous.id === trip.id
    && previous.trip !== trip
  );
}

/**
 * Product bridge from immutable React trip edits to durable local drafts and,
 * for writable v4 trips, to the existing incremental sync scheduler.
 *
 * The 350ms timer is only a local IndexedDB boundary. Firestore remains behind
 * the v4 runtime's own ~3s debounce/coalescing policy.
 *
 * Callback identities are intentionally held in refs: repository/config changes
 * must never cancel a pending local draft without rescheduling it. A real trip
 * object change is the editing signal; timestamps are metadata, not authority.
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
  const stageTripRef = useRef(stageTrip);
  const getPersistenceStateRef = useRef(getTripPersistenceState);
  const canRemoteSyncRef = useRef(Boolean(canRemoteSync));
  const markerRef = useRef(null);
  const stageTimerRef = useRef(null);
  const explicitSaveRef = useRef(false);
  const adoptNextTripRef = useRef(false);

  latestTripRef.current = trip;
  stageTripRef.current = stageTrip;
  getPersistenceStateRef.current = getTripPersistenceState;
  canRemoteSyncRef.current = Boolean(canRemoteSync);

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current != null) {
      globalThis.clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  const stageCurrent = useCallback(async ({ remote = canRemoteSyncRef.current } = {}) => {
    const current = latestTripRef.current;
    const stage = stageTripRef.current;
    if (!current?.id || typeof stage !== 'function') return null;
    try {
      const result = await stage(current, { remote });
      if (explicitSaveRef.current) return result;
      const nextState = stagedState(result);
      setState(nextState);
      setAutosyncActive(
        result?.autosync === true
        && nextState !== TRIP_PERSISTENCE_STATE.SAVED
        && nextState !== TRIP_PERSISTENCE_STATE.ERROR
      );
      return result;
    } catch (error) {
      if (!explicitSaveRef.current) {
        setState(errorState(error));
        setAutosyncActive(false);
      }
      throw error;
    }
  }, []);

  const scheduleStage = useCallback(() => {
    clearStageTimer();
    stageTimerRef.current = globalThis.setTimeout(() => {
      stageTimerRef.current = null;
      void stageCurrent().catch(() => {});
    }, localDebounceMs);
  }, [clearStageTimer, localDebounceMs, stageCurrent]);

  useEffect(() => {
    const id = trip?.id || '';
    if (!id) return undefined;
    const previous = markerRef.current;
    markerRef.current = { id, trip };

    if (!previous || previous.id !== id) {
      clearStageTimer();
      explicitSaveRef.current = false;
      adoptNextTripRef.current = false;
      setAutosyncActive(false);
      let cancelled = false;
      const readState = getPersistenceStateRef.current;
      if (typeof readState === 'function') {
        Promise.resolve(readState(id)).then((result) => {
          if (cancelled) return;
          const nextState = normalizedState(result?.state, TRIP_PERSISTENCE_STATE.SAVED);
          setState(nextState === 'manual' ? TRIP_PERSISTENCE_STATE.SAVED : nextState);
          const shouldResume = result?.recoveredDraft === true;
          setAutosyncActive(
            result?.autosync === true
            && nextState !== TRIP_PERSISTENCE_STATE.SAVED
          );
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

    const editTransition = isTripEditTransition(previous, trip);
    if (adoptNextTripRef.current && editTransition) {
      adoptNextTripRef.current = false;
      return undefined;
    }

    if (!editTransition || explicitSaveRef.current) {
      return undefined;
    }
    setState(TRIP_PERSISTENCE_STATE.PENDING);
    scheduleStage();
    return clearStageTimer;
  }, [clearStageTimer, scheduleStage, trip]);

  useEffect(() => {
    if (!autosyncActive || !trip?.id || explicitSaveRef.current) {
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      const readState = getPersistenceStateRef.current;
      if (typeof readState !== 'function') return;
      try {
        const result = await readState(trip.id);
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
  }, [autosyncActive, statusPollMs, trip?.id]);

  useEffect(() => () => clearStageTimer(), [clearStageTimer]);

  const persistLocalNow = useCallback(async () => {
    clearStageTimer();
    return stageCurrent({ remote: false });
  }, [clearStageTimer, stageCurrent]);

  const markSaving = useCallback(() => {
    clearStageTimer();
    explicitSaveRef.current = true;
    adoptNextTripRef.current = false;
    setAutosyncActive(false);
    setState(TRIP_PERSISTENCE_STATE.SYNCING);
  }, [clearStageTimer]);

  const markSaved = useCallback(({ adoptNextTrip = false } = {}) => {
    adoptNextTripRef.current = Boolean(adoptNextTrip);
    explicitSaveRef.current = false;
    setAutosyncActive(false);
    setState(TRIP_PERSISTENCE_STATE.SAVED);
  }, []);

  const markSaveError = useCallback((error) => {
    explicitSaveRef.current = false;
    adoptNextTripRef.current = false;
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
