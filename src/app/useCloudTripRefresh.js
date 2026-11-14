import { useEffect, useRef } from 'react';
import { tripsDifferInCloudData } from '../modules/trips/tripCloudSync.js';

const MIN_INTERVAL_MS = 4000;

/**
 * Al volver a la app (otra pestaña, desbloquear el iPhone, abrir la PWA que
 * seguía en memoria) trae la versión de la nube del viaje abierto, para ver lo
 * guardado desde otro dispositivo. Nunca pisa cambios de este dispositivo:
 * solo actúa si aquí todo está guardado y el viaje no cambió mientras tanto.
 */
export function useCloudTripRefresh({
  enabled,
  trip,
  persistence,
  getCloudTripUpdate,
  loadTrip,
}) {
  const latest = useRef({});
  latest.current = {
    enabled,
    trip,
    persistenceState: persistence?.state,
    getCloudTripUpdate,
    // Cargar la versión de la nube no es una edición: no se vuelve a subir.
    applyCloudTrip: async ({ trip: cloudTrip, accept }) => {
      await accept();
      persistence.markSaved({ adoptNextTrip: true });
      loadTrip(cloudTrip);
    },
  };
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;

    async function check() {
      const current = latest.current;
      if (!current.enabled || !current.trip?.id || current.persistenceState !== 'saved') return;
      if (typeof current.getCloudTripUpdate !== 'function') return;
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (runningRef.current || now - lastRunRef.current < MIN_INTERVAL_MS) return;
      runningRef.current = true;
      lastRunRef.current = now;
      const tripAtStart = current.trip;
      try {
        const update = await current.getCloudTripUpdate(tripAtStart.id);
        const after = latest.current;
        if (
          !update?.trip
          || after.trip !== tripAtStart
          || after.persistenceState !== 'saved'
          || !tripsDifferInCloudData(tripAtStart, update.trip)
        ) return;
        await after.applyCloudTrip(update);
      } catch {
        // Sin conexión: se intenta de nuevo la próxima vez que vuelva la app.
      } finally {
        runningRef.current = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== 'hidden') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);
}
