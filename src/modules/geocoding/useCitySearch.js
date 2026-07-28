import { useEffect, useRef, useState } from 'react';
import { config } from '../../config.js';
import { getGeocoder } from './geocodingProvider.js';

// Hook de búsqueda de ciudades.
// - Dispara sugerencias a partir del 3er carácter (config.citySearchMinChars).
// - Debounce para no saturar al proveedor (requisito de robustez/escala).
// - Cancela peticiones obsoletas con AbortController (evita "race conditions").
//
// Estados expuestos: { results, loading, error }
export function useCitySearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const q = (query || '').trim();

    // Limpia temporizador previo en cada cambio de query.
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < config.citySearchMinChars) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      // Aborta la petición anterior si seguía en curso.
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await getGeocoder().search(q, { signal: controller.signal });
        setResults(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Error de búsqueda');
          setResults([]);
        }
      } finally {
        // Solo apaga el loading si esta petición sigue siendo la vigente.
        if (abortRef.current === controller) setLoading(false);
      }
    }, config.citySearchDebounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, loading, error };
}
