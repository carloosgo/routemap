import {
  V4_FLUSH_REASON,
  beginScheduledFlush,
  completeScheduledFlush,
  createSyncScheduleState,
  markScheduleDirty,
  nextScheduledFlush,
  requestScheduleFlush,
  setScheduleForeground,
  setScheduleOnline,
} from './syncScheduleModel.js';

function requireFunction(value, field) {
  if (typeof value !== 'function') throw new TypeError(`${field} debe ser función.`);
  return value;
}

function requirePositiveMs(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} debe ser un número positivo.`);
  }
  return value;
}

function safeMetricEmitter(onMetric) {
  if (onMetric == null) return () => {};
  const emit = requireFunction(onMetric, 'onMetric');
  return (metric) => {
    try {
      emit(metric);
    } catch {
      // Observabilidad best-effort: nunca puede romper el scheduler o el guardado.
    }
  };
}

export function createV4SyncLifecycleController({
  flush,
  now = () => Date.now(),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (handle) => globalThis.clearTimeout(handle),
  onError = () => {},
  onMetric = null,
  debounceMs = 3000,
  maxDirtyAgeMs = 30000,
  nonLeaderRetryMs = 4000,
  unexpectedErrorRetryMs = 10000,
  online = true,
  foreground = true,
} = {}) {
  const executeFlush = requireFunction(flush, 'flush');
  const clock = requireFunction(now, 'now');
  const scheduleTimer = requireFunction(setTimer, 'setTimer');
  const cancelTimer = requireFunction(clearTimer, 'clearTimer');
  const reportError = requireFunction(onError, 'onError');
  const emitMetric = safeMetricEmitter(onMetric);
  requirePositiveMs(debounceMs, 'debounceMs');
  requirePositiveMs(maxDirtyAgeMs, 'maxDirtyAgeMs');
  requirePositiveMs(nonLeaderRetryMs, 'nonLeaderRetryMs');
  requirePositiveMs(unexpectedErrorRetryMs, 'unexpectedErrorRetryMs');

  let state = createSyncScheduleState({ online, foreground });
  let timerHandle = null;
  let scheduled = null;
  let inFlight = false;
  let stopped = false;

  function clearScheduledTimer() {
    if (timerHandle != null) cancelTimer(timerHandle);
    timerHandle = null;
    scheduled = null;
  }

  function reschedule() {
    clearScheduledTimer();
    if (stopped || inFlight) return null;
    const currentTime = clock();
    const plan = nextScheduledFlush(state, currentTime, {
      debounceMs,
      maxDirtyAgeMs,
    });
    if (!plan) return null;

    const delay = Math.max(0, plan.dueAt - currentTime);
    scheduled = plan;
    timerHandle = scheduleTimer(() => {
      timerHandle = null;
      scheduled = null;
      void runFlush(plan.reason);
    }, delay);
    return plan;
  }

  async function runFlush(reason) {
    if (stopped || !state.online || state.dirtySince == null) return null;
    if (inFlight) {
      state = requestScheduleFlush(state, V4_FLUSH_REASON.FOLLOW_UP);
      return null;
    }

    clearScheduledTimer();
    const startedAt = clock();
    const started = beginScheduledFlush(state);
    state = started.state;
    inFlight = true;
    try {
      const result = await executeFlush({ reason });
      const finishedAt = clock();
      if (result?.leader === false) {
        state = completeScheduledFlush(state, {
          flushedGeneration: started.generation,
          hasPending: true,
          nextAttemptAt: finishedAt + nonLeaderRetryMs,
          nowMs: finishedAt,
        });
        emitMetric({
          event: 'flush',
          outcome: 'not-leader',
          reason,
          durationMs: Math.max(0, finishedAt - startedAt),
          pending: null,
        });
        return result;
      }

      const pending = Math.max(0, Math.trunc(Number(result?.pending) || 0));
      state = completeScheduledFlush(state, {
        flushedGeneration: started.generation,
        hasPending: pending > 0,
        nextAttemptAt: result?.nextAttemptAt ?? null,
        nowMs: finishedAt,
      });
      emitMetric({
        event: 'flush',
        outcome: 'success',
        reason,
        durationMs: Math.max(0, finishedAt - startedAt),
        pending,
        retryScheduled: result?.nextAttemptAt != null,
      });
      return result;
    } catch (error) {
      const failedAt = clock();
      state = completeScheduledFlush(state, {
        flushedGeneration: started.generation,
        hasPending: true,
        nextAttemptAt: failedAt + unexpectedErrorRetryMs,
        nowMs: failedAt,
      });
      reportError(error);
      emitMetric({
        event: 'flush',
        outcome: 'unexpected-error',
        reason,
        durationMs: Math.max(0, failedAt - startedAt),
        pending: null,
        errorName: error?.name || 'Error',
        errorCode: typeof error?.code === 'string' ? error.code : '',
      });
      return { error };
    } finally {
      inFlight = false;
      reschedule();
    }
  }

  return {
    markDirty() {
      if (stopped) return null;
      state = markScheduleDirty(state, clock());
      return reschedule();
    },

    setOnline(value) {
      if (stopped) return null;
      state = setScheduleOnline(state, value, clock());
      return reschedule();
    },

    setForeground(value) {
      if (stopped) return null;
      state = setScheduleForeground(state, value, clock());
      return reschedule();
    },

    saveNow() {
      if (stopped) return Promise.resolve(null);
      state = requestScheduleFlush(state, V4_FLUSH_REASON.SAVE_NOW);
      return runFlush(V4_FLUSH_REASON.SAVE_NOW);
    },

    flushNow(reason = V4_FLUSH_REASON.SAVE_NOW) {
      if (stopped) return Promise.resolve(null);
      state = requestScheduleFlush(state, reason);
      return runFlush(reason);
    },

    snapshot() {
      return {
        ...state,
        inFlight,
        stopped,
        scheduled: scheduled ? { ...scheduled } : null,
      };
    },

    stop() {
      stopped = true;
      clearScheduledTimer();
    },
  };
}
