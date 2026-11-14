/**
 * Repositorio de viajes que sigue funcionando sin internet.
 *
 * Con conexión lee la nube y deja una copia en el teléfono (offlineTripStore).
 * Sin conexión, o si la nube no responde a tiempo, muestra esa copia. Las
 * escrituras no cambian: siguen yendo a la cola de Storage v4, que ya guarda
 * los cambios en el teléfono y los sube cuando vuelve la conexión.
 */

const DEFAULT_TIMEOUT_MS = 6000;

export function browserIsOnline() {
  const value = globalThis.navigator?.onLine;
  return value !== false;
}

function offlineError() {
  const error = new Error('Sin conexión y sin copia del viaje en este dispositivo.');
  error.code = 'trip/offline-unavailable';
  return error;
}

function withTimeout(promise, timeoutMs) {
  let handle = null;
  const timeout = new Promise((_, reject) => {
    handle = globalThis.setTimeout(() => {
      const error = new Error('La nube no respondió a tiempo.');
      error.code = 'trip/remote-timeout';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(handle));
}

export function createOfflineTripRepository({
  repository,
  store,
  isOnline = browserIsOnline,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!repository || !store) throw new TypeError('Se requieren repositorio y copia local.');

  let warming = null;

  function remote(operation) {
    if (!isOnline()) return Promise.reject(offlineError());
    return withTimeout(Promise.resolve().then(operation), timeoutMs);
  }

  function remember(trip) {
    if (!trip?.id) return Promise.resolve(false);
    return store.putTrip(trip).catch(() => false);
  }

  /**
   * Descarga en segundo plano todos los viajes de la cuenta para tenerlos sin
   * internet, aunque no se hayan abierto en este dispositivo.
   */
  function warmAll(entries) {
    if (warming || typeof repository.fetchRemote !== 'function') return warming;
    warming = (async () => {
      for (const entry of entries) {
        if (!isOnline()) break;
        try {
          const fetched = await withTimeout(repository.fetchRemote(entry.id), timeoutMs * 3);
          if (!fetched?.trip) continue;
          // Si en este dispositivo hay cambios sin subir, la copia local ya es
          // la más nueva: no se reemplaza por la de la nube.
          const state = await repository.getPersistenceState?.(entry.id).catch(() => null);
          if (state && !(state.state === 'saved' && !(Number(state.pending) > 0))) continue;
          // Si este dispositivo nunca abrió el viaje, se adopta la nube como
          // base: así lo que se edite sin internet entra a la cola y se sube.
          const known = await repository.localChangeCount?.(fetched.trip).catch(() => 0);
          if (known === null) await fetched.accept();
          await remember(fetched.trip);
        } catch {
          // Un viaje que no baja ahora se intenta la próxima vez.
        }
      }
    })().finally(() => { warming = null; });
    return warming;
  }

  return {
    ...repository,

    async initialize() {
      if (!isOnline()) return 0;
      try {
        return await withTimeout(Promise.resolve(repository.initialize?.()), timeoutMs);
      } catch {
        // Sin red la cola se recupera cuando vuelve la conexión.
        return 0;
      }
    },

    async list() {
      try {
        const entries = await remote(() => repository.list());
        await store.putList(entries).catch(() => {});
        void warmAll(entries);
        return entries;
      } catch (error) {
        const cached = await store.getList().catch(() => null);
        if (cached) return cached;
        throw error;
      }
    },

    async get(id) {
      try {
        let trip;
        if (typeof repository.fetchRemote === 'function') {
          // Leer y adoptar la nube por separado: si la respuesta llega tarde
          // (después de mostrar la copia local) no se adopta como base.
          const fetched = await remote(() => repository.fetchRemote(id));
          if (fetched) await fetched.accept();
          trip = fetched?.trip || null;
        } else {
          trip = await remote(() => repository.get(id));
        }
        if (trip) await remember(trip);
        else await store.removeTrip(id).catch(() => {});
        return trip;
      } catch (error) {
        if (error?.code === 'trip/storage-v4-required') throw error;
        const cached = await store.getTrip(id).catch(() => null);
        if (cached) return cached;
        throw error;
      }
    },

    async fetchRemote(id) {
      if (typeof repository.fetchRemote !== 'function') return null;
      const fetched = await remote(() => repository.fetchRemote(id));
      if (!fetched?.trip) return fetched;
      return {
        ...fetched,
        async accept() {
          await fetched.accept();
          await remember(fetched.trip);
        },
      };
    },

    async save(trip) {
      const saved = await repository.save(trip);
      await remember(saved || trip);
      if ((saved || trip)?.id) await store.setLastTripId((saved || trip).id).catch(() => {});
      return saved;
    },

    async remove(id) {
      await repository.remove(id);
      await store.removeTrip(id).catch(() => {});
    },

    /** Última versión editada en este dispositivo. */
    rememberTrip: remember,

    rememberLastTrip(id) {
      return id ? store.setLastTripId(id).catch(() => false) : Promise.resolve(false);
    },

    lastTripId() {
      return store.getLastTripId().catch(() => null);
    },

    warmAll,

    async close() {
      await repository.close?.();
      await store.close?.().catch(() => {});
    },
  };
}
