import { useEffect, useRef, useState } from 'react';
import { config } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { getGeocoder } from './geocodingProvider.js';

export function useCitySearch(query) {
  const { t, locale } = useTranslation();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const q = (query || '').trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (q.length < config.citySearchMinChars) {
      setResults([]);
      setLoading(false);
      setHasError(false);
      return undefined;
    }

    setLoading(true);
    setHasError(false);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await getGeocoder().search(q, {
          signal: controller.signal,
          language: locale,
        });
        if (abortRef.current === controller) setResults(data);
      } catch (searchError) {
        if (searchError.name !== 'AbortError' && abortRef.current === controller) {
          setHasError(true);
          setResults([]);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    }, config.citySearchDebounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [query, locale]);

  return { results, loading, error: hasError ? t('citySearchError') : null };
}
