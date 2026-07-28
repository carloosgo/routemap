import { useState, useEffect, useCallback } from 'react';
import { getRepository } from '../storage/storageRepository.js';

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
    } catch (err) {
      setError(err.message || 'Error al cargar viajes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveTrip = useCallback(
    async (trip) => {
      const saved = await getRepository().save(trip);
      await refresh();
      return saved;
    },
    [refresh]
  );

  const deleteTrip = useCallback(
    async (id) => {
      await getRepository().remove(id);
      await refresh();
    },
    [refresh]
  );

  return { trips, loading, error, refresh, saveTrip, deleteTrip };
}
