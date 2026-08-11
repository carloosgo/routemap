import { assertLocalPersistenceAdapter } from './localPersistenceContract.js';
import { createV4SyncLifecycleController } from './syncLifecycleController.js';

const DIRTY_MESSAGE = 'v4-mutation-dirty';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function requireCoordinator(coordinator) {
  if (typeof coordinator?.flush !== 'function') {
    throw new TypeError('syncCoordinator requiere flush().');
  }
  return coordinator;
}

function normalizeNotifier(notifier) {
  if (!notifier) {
    return {
      publish() {},
      subscribe() { return () => {}; },
    };
  }
  if (typeof notifier.publish !== 'function' || typeof notifier.subscribe !== 'function') {
    throw new TypeError('crossContextNotifier requiere publish() y subscribe().');
  }
  return notifier;
}

export function createV4SyncRuntime({
  userId,
  localPersistence,
  syncCoordinator,
  crossContextNotifier = null,
  now = () => Date.now(),
  lifecycleOptions = {},
} = {}) {
  const ownerId = requiredText(userId, 'userId');
  const local = assertLocalPersistenceAdapter(localPersistence);
  const coordinator = requireCoordinator(syncCoordinator);
  const notifier = normalizeNotifier(crossContextNotifier);
  let stopped = false;

  const lifecycle = createV4SyncLifecycleController({
    ...lifecycleOptions,
    now,
    flush: () => coordinator.flush({ userId: ownerId }),
  });

  const unsubscribe = notifier.subscribe((message) => {
    if (stopped || message?.type !== DIRTY_MESSAGE) return;
    if (message?.payload?.userId !== ownerId) return;
    lifecycle.markDirty();
  });

  return {
    async recoverPending() {
      if (stopped) return 0;
      const pending = await local.listMutations({ userId: ownerId });
      if (pending.length) lifecycle.markDirty();
      return pending.length;
    },

    async commitIntent(intent) {
      if (stopped) throw new Error('El runtime v4 está detenido.');
      if (intent?.userId !== ownerId) {
        throw new TypeError('La intención no pertenece al usuario del runtime.');
      }
      const result = await local.commitLocalIntent({ intent, nowMs: now() });
      if (!result.discarded) {
        lifecycle.markDirty();
        notifier.publish(DIRTY_MESSAGE, {
          userId: ownerId,
          tripId: intent.tripId,
          entityKey: result.entityKey,
        });
      }
      return result;
    },

    setOnline(value) {
      return lifecycle.setOnline(value);
    },

    setForeground(value) {
      return lifecycle.setForeground(value);
    },

    saveNow() {
      return lifecycle.saveNow();
    },

    snapshot() {
      return lifecycle.snapshot();
    },

    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      lifecycle.stop();
    },
  };
}
