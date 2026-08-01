import { useEffect, useRef, useState } from 'react';
import { searchArcgisPlaces } from './arcgisPlacesProvider.js';
import './PlaceSearchOverlay.css';

function submitToMapSearch(value) {
  const input = document.querySelector('.map-wrap input[aria-label="Buscar lugares"]');
  const form = input?.closest('form');
  if (!input || !form) return;

  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  window.requestAnimationFrame(() => form.requestSubmit());
}

export function PlaceSearchOverlay() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const text = query.trim();
    abortRef.current?.abort();

    if (text.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const results = await searchArcgisPlaces(text, {
          signal: controller.signal,
          limit: 6,
        });
        setSuggestions(results);
        setOpen(true);
      } catch (searchError) {
        if (searchError.name !== 'AbortError') {
          setSuggestions([]);
          setError(searchError.message || 'No fue posible obtener sugerencias.');
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function runSearch(value = query) {
    const text = value.trim();
    if (text.length < 3) return;
    setOpen(false);
    submitToMapSearch(text);
  }

  function chooseSuggestion(place) {
    const text = [place.name, place.address].filter(Boolean).join(', ');
    setQuery(text);
    setOpen(false);
    submitToMapSearch(text);
  }

  return (
    <div className="place-search-overlay">
      <form
        className="place-search-overlay__form"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Buscar lugares, por ejemplo: McDonald's, Paris"
          aria-label="Buscar lugares en ArcGIS"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="place-search-overlay__clear"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setOpen(false);
              submitToMapSearch('');
            }}
          >
            Limpiar
          </button>
        )}
        <button
          type="submit"
          className="place-search-overlay__submit"
          disabled={loading || query.trim().length < 3}
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {open && (suggestions.length > 0 || error) && (
        <div className="place-search-overlay__suggestions" role="listbox">
          {error ? (
            <div className="place-search-overlay__message">{error}</div>
          ) : (
            suggestions.map((place) => (
              <button
                type="button"
                role="option"
                key={place.id}
                className="place-search-overlay__suggestion"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSuggestion(place)}
              >
                <strong>{place.name}</strong>
                <span>{place.address || [place.city, place.country].filter(Boolean).join(', ')}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
