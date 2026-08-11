import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/modules/storage-v4/syncScheduleModel.js';

test('debounce se mueve con cada edición pero max dirty age pone un techo', () => {
  let state = createSyncScheduleState();
  state = markScheduleDirty(state, 1000);
  assert.deepEqual(nextScheduledFlush(state, 1000), {
    dueAt: 4000,
    reason: V4_FLUSH_REASON.DEBOUNCE,
  });

  state = markScheduleDirty(state, 3000);
  assert.deepEqual(nextScheduledFlush(state, 3000), {
    dueAt: 6000,
    reason: V4_FLUSH_REASON.DEBOUNCE,
  });

  state = markScheduleDirty(state, 29500);
  assert.deepEqual(nextScheduledFlush(state, 29500), {
    dueAt: 31000,
    reason: V4_FLUSH_REASON.MAX_DIRTY_AGE,
  });
});

test('offline nunca agenda red y reconexión solicita flush inmediato', () => {
  let state = createSyncScheduleState({ online: false });
  state = markScheduleDirty(state, 1000);
  assert.equal(nextScheduledFlush(state, 1000), null);

  state = setScheduleOnline(state, true, 5000);
  assert.deepEqual(nextScheduledFlush(state, 5000), {
    dueAt: 5000,
    reason: V4_FLUSH_REASON.RECONNECT,
  });
});

test('pasar a background o volver a foreground pide flush inmediato si hay cambios', () => {
  let state = markScheduleDirty(createSyncScheduleState(), 1000);
  state = setScheduleForeground(state, false, 1200);
  assert.equal(nextScheduledFlush(state, 1200).reason, V4_FLUSH_REASON.BACKGROUND);

  const started = beginScheduledFlush(state);
  state = completeScheduledFlush(started.state, {
    flushedGeneration: started.generation,
    hasPending: false,
    nowMs: 1300,
  });
  state = markScheduleDirty(state, 2000);
  state = setScheduleForeground(state, true, 2100);
  assert.equal(nextScheduledFlush(state, 2100).reason, V4_FLUSH_REASON.FOREGROUND);
});

test('save now solo aplica cuando realmente existen cambios pendientes', () => {
  const clean = createSyncScheduleState();
  assert.equal(requestScheduleFlush(clean), clean);

  const dirty = requestScheduleFlush(markScheduleDirty(clean, 1000));
  assert.deepEqual(nextScheduledFlush(dirty, 1001), {
    dueAt: 1001,
    reason: V4_FLUSH_REASON.SAVE_NOW,
  });
});

test('una edición durante el flush no puede quedar marcada como limpia por un ack viejo', () => {
  let state = markScheduleDirty(createSyncScheduleState(), 1000);
  const started = beginScheduledFlush(state);
  assert.equal(started.generation, 1);

  state = markScheduleDirty(started.state, 1100);
  state = completeScheduledFlush(state, {
    flushedGeneration: started.generation,
    hasPending: false,
    nowMs: 1200,
  });

  assert.equal(state.dirtyGeneration, 2);
  assert.equal(state.dirtySince, 1000);
  assert.equal(state.immediateReason, V4_FLUSH_REASON.FOLLOW_UP);
});

test('flush confirmado limpia estado solo si no queda trabajo ni hubo edición posterior', () => {
  const dirty = markScheduleDirty(createSyncScheduleState(), 1000);
  const started = beginScheduledFlush(dirty);
  const clean = completeScheduledFlush(started.state, {
    flushedGeneration: started.generation,
    hasPending: false,
    nowMs: 1500,
  });
  assert.equal(clean.dirtySince, null);
  assert.equal(clean.lastDirtyAt, null);
  assert.equal(nextScheduledFlush(clean, 1500), null);
});
