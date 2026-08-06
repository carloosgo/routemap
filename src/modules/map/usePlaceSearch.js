import { useEffect, useRef, useState } from 'react';
import { config } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { isPlaced } from '../trips/tripModel.js';
import { searchGeoapifyPlaces } from '../places/geoapifyClient.js';

export function usePlaceSearch({ viewMode }) {
  const { t } = useTranslation();
  const searchAbortRef = useRef(null);
  const autocompleteAbortRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const autocompleteSequenceRef = useRef(0);
  const skipAutocompleteRef = useRef(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [errorState, setErrorState] = useState(null);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      autocompleteAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    autocompleteAbortRef.current?.abort();
    if (viewMode !== 'places') {
      setSuggestions([]);
      setSuggesting(false);
      setShowSuggestions(false);
      return undefined;
    }
    if (skipAutocompleteRef.current) {
      skipAutocompleteRef.current = false;
      setSuggestions([]);
      setSuggesting(false);
      setShowSuggestions(false);
      return undefined;
    }

    const text = query.trim();
    const sequence = autocompleteSequenceRef.current + 1;
    autocompleteSequenceRef.current = sequence;

    if (text.length < config.geoapify.searchMinChars) {
      setSuggestions([]);
      setSuggesting(false);
      setShowSuggestions(false);
      return undefined;
    }

    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        const next = await searchGeoapifyPlaces(text, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted && sequence === autocompleteSequenceRef.current) {
          setSuggestions(next);
          setShowSuggestions(true);
        }
      } catch (suggestionError) {
        if (suggestionError?.name !== 'AbortError') {
          console.warn('[Place autocomplete] unavailable', suggestionError);
        }
      } finally {
        if (!controller.signal.aborted && sequence === autocompleteSequenceRef.current) {
          setSuggesting(false);
        }
      }
    }, config.geoapify.searchDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, viewMode]);

  async function submitSearch(event) {
    event?.preventDefault();
    const text = query.trim();
    if (text.length < config.geoapify.searchMinChars) {
      setErrorState({
        key: 'minimumSearchCharacters',
        variables: { count: config.geoapify.searchMinChars },
      });
      return;
    }

    autocompleteAbortRef.current?.abort();
    setSuggesting(false);
    searchAbortRef.current?.abort();
    setShowSuggestions(false);
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setErrorState(null);

    try {
      const next = await searchGeoapifyPlaces(text, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted && sequence === searchSequenceRef.current) {
        setResults(next);
      }
    } catch (searchError) {
      if (searchError?.name !== 'AbortError' && sequence === searchSequenceRef.current) {
        setErrorState({ key: 'placeSearchError' });
      }
    } finally {
      if (!controller.signal.aborted && sequence === searchSequenceRef.current) {
        setSearching(false);
      }
    }
  }

  function chooseSuggestion(place) {
    if (!isPlaced(place)) return;
    const location = [place.city, place.country].filter(Boolean).join(', ');
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    skipAutocompleteRef.current = true;
    setQuery([place.name, location].filter(Boolean).join(', '));
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggesting(false);
    setSearching(false);
    setErrorState(null);
    setResults([place]);
  }

  function clearSearch() {
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    skipAutocompleteRef.current = false;
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggesting(false);
    setSearching(false);
    setErrorState(null);
  }

  function handleQueryChange(event) {
    const next = event.target.value;
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    setSuggesting(false);
    setQuery(next);
    setErrorState(null);
    if (next.trim().length < config.geoapify.searchMinChars) {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function showSuggestionsOnFocus() {
    if (suggestions.length) setShowSuggestions(true);
  }

  return {
    query,
    results,
    suggestions,
    showSuggestions,
    searching,
    suggesting,
    error: errorState ? t(errorState.key, errorState.variables) : '',
    canClearSearch: Boolean(query || results.length > 0 || suggestions.length > 0 || errorState),
    minChars: config.geoapify.searchMinChars,
    submitSearch,
    chooseSuggestion,
    clearSearch,
    handleQueryChange,
    showSuggestionsOnFocus,
  };
}
