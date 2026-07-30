import { useState, useEffect, useCallback } from 'react';
import { getRepository } from '../storage/storageRepository.js';

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Hook para la lista de viajes guardados (consultar, guardar, eliminar).
// Habla con la capa de almacenamiento a través del repositorio, sin saber
// si por debajo es localStorage o un backend REST.
export function useSavedTrips() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getRepository().list();
      setTrips(list);
      return list;
    } catch (err) {
      setError(errorMessage(err, 'Error al cargar viajes'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveTrip = useCallback(
    async (trip) => {
      setError(null);
      try {
        const saved = await getRepository().save(trip);
        await refresh();
        return saved;
      } catch (err) {
        setError(errorMessage(err, 'Error al guardar el viaje'));
        throw err;
      }
    },
    [refresh]
  );

  const deleteTrip = useCallback(
    async (id) => {
      setError(null);
      try {
        await getRepository().remove(id);
        await refresh();
      } catch (err) {
        setError(errorMessage(err, 'Error al eliminar el viaje'));
        throw err;
      }
    },
    [refresh]
  );

  const clearError = useCallback(() => setError(null), []);

  return { trips, loading, error, refresh, saveTrip, deleteTrip, clearError };
}
