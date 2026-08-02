import { useEffect, useRef, useState } from 'react';
import { config } from '../../config.js';
import { searchGeoapifyPlaces } from '../places/geoapifyClient.js';

// Hook de búsqueda de ciudades.
// - Dispara sugerencias a partir del 3er carácter (config.citySearchMinChars).
// - Debounce para no saturar al proveedor.
// - Ignora respuestas obsoletas para evitar race conditions.
// - La clave privada permanece en Firebase Secret Manager; el navegador solo
//   invoca la callable function geoapifyAutocomplete.
export function useCitySearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const q = (query || '').trim();
    const requestId = ++requestIdRef.current;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < config.citySearchMinChars) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchGeoapifyPlaces(q);
        if (requestIdRef.current !== requestId) return;
        setResults(data);
      } catch (searchError) {
        if (requestIdRef.current !== requestId) return;
        setError(searchError instanceof Error ? searchError.message : 'Error de búsqueda');
        setResults([]);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, config.citySearchDebounceMs);

    return () => {
      clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, loading, error };
}
