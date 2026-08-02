import { useEffect, useRef, useState } from 'react';
import { config } from '../../config.js';
import { getGeocoder } from './geocodingProvider.js';

// Hook exclusivo para buscar países y ciudades del itinerario.
// Este flujo es independiente del proveedor usado por el mapa y por la
// búsqueda de hoteles, restaurantes, estaciones y otros lugares.
export function useCitySearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const q = (query || '').trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < config.citySearchMinChars) {
      if (abortRef.current) abortRef.current.abort();
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await getGeocoder().search(q, { signal: controller.signal });
        if (abortRef.current === controller) setResults(data);
      } catch (searchError) {
        if (searchError.name !== 'AbortError' && abortRef.current === controller) {
          setError(searchError.message || 'Error de búsqueda');
          setResults([]);
        }
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, config.citySearchDebounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { results, loading, error };
}
