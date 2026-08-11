export const V4_FLUSH_REASON = Object.freeze({
  DEBOUNCE: 'debounce',
  MAX_DIRTY_AGE: 'max-dirty-age',
  RECONNECT: 'reconnect',
  BACKGROUND: 'background',
  FOREGROUND: 'foreground',
  SAVE_NOW: 'save-now',
  FOLLOW_UP: 'follow-up',
});

function requireTime(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} debe ser un tiempo no negativo.`);
  }
  return value;
}

function requirePositiveMs(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} debe ser un número positivo.`);
  }
  return value;
}

export function createSyncScheduleState({
  online = true,
  foreground = true,
} = {}) {
  return {
    online: Boolean(online),
    foreground: Boolean(foreground),
    dirtySince: null,
    lastDirtyAt: null,
    dirtyGeneration: 0,
    immediateReason: null,
  };
}

export function markScheduleDirty(state, nowMs) {
  const now = requireTime(nowMs, 'nowMs');
  return {
    ...state,
    dirtySince: state.dirtySince ?? now,
    lastDirtyAt: now,
    dirtyGeneration: state.dirtyGeneration + 1,
  };
}

export function setScheduleOnline(state, online, nowMs) {
  requireTime(nowMs, 'nowMs');
  const nextOnline = Boolean(online);
  const reconnected = !state.online && nextOnline && state.dirtySince != null;
  return {
    ...state,
    online: nextOnline,
    immediateReason: reconnected ? V4_FLUSH_REASON.RECONNECT : state.immediateReason,
  };
}

export function setScheduleForeground(state, foreground, nowMs) {
  requireTime(nowMs, 'nowMs');
  const nextForeground = Boolean(foreground);
  let immediateReason = state.immediateReason;
  if (state.dirtySince != null && state.foreground !== nextForeground) {
    immediateReason = nextForeground
      ? V4_FLUSH_REASON.FOREGROUND
      : V4_FLUSH_REASON.BACKGROUND;
  }
  return {
    ...state,
    foreground: nextForeground,
    immediateReason,
  };
}

export function requestScheduleFlush(state, reason = V4_FLUSH_REASON.SAVE_NOW) {
  if (!Object.values(V4_FLUSH_REASON).includes(reason)) {
    throw new TypeError('reason de flush inválido.');
  }
  if (state.dirtySince == null) return state;
  return { ...state, immediateReason: reason };
}

export function nextScheduledFlush(
  state,
  nowMs,
  {
    debounceMs = 3000,
    maxDirtyAgeMs = 30000,
  } = {}
) {
  const now = requireTime(nowMs, 'nowMs');
  const debounce = requirePositiveMs(debounceMs, 'debounceMs');
  const maxAge = requirePositiveMs(maxDirtyAgeMs, 'maxDirtyAgeMs');
  if (!state.online || state.dirtySince == null) return null;

  if (state.immediateReason) {
    return { dueAt: now, reason: state.immediateReason };
  }

  const debounceDue = state.lastDirtyAt + debounce;
  const maxAgeDue = state.dirtySince + maxAge;
  if (maxAgeDue <= debounceDue) {
    return { dueAt: maxAgeDue, reason: V4_FLUSH_REASON.MAX_DIRTY_AGE };
  }
  return { dueAt: debounceDue, reason: V4_FLUSH_REASON.DEBOUNCE };
}

export function beginScheduledFlush(state) {
  if (state.dirtySince == null) return { state, generation: null };
  return {
    state: { ...state, immediateReason: null },
    generation: state.dirtyGeneration,
  };
}

export function completeScheduledFlush(
  state,
  {
    flushedGeneration,
    hasPending,
    nowMs,
  }
) {
  const now = requireTime(nowMs, 'nowMs');
  if (!Number.isInteger(flushedGeneration) || flushedGeneration < 1) {
    throw new TypeError('flushedGeneration debe ser un entero positivo.');
  }

  const editedDuringFlight = state.dirtyGeneration !== flushedGeneration;
  if (!hasPending && !editedDuringFlight) {
    return {
      ...state,
      dirtySince: null,
      lastDirtyAt: null,
      immediateReason: null,
    };
  }

  return {
    ...state,
    dirtySince: state.dirtySince ?? now,
    immediateReason: editedDuringFlight
      ? V4_FLUSH_REASON.FOLLOW_UP
      : state.immediateReason,
  };
}
