import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import {
  canonicalCityFromSearchResult,
  createGeoapifyCityProvider,
} from '../geocoding/citySearchClient.js';
import {
  autocompleteGooglePlaces,
  createGooglePlacesSessionToken,
  resolveGooglePlace,
  searchGooglePlaces,
} from '../places/googlePlacesClient.js';

function citySearchResult(city) {
  const canonical = canonicalCityFromSearchResult(city);
  return {
    ...canonical,
    kind: 'city',
    source: 'geoapify',
    secondaryText: [city?.region, canonical.country].filter(Boolean).join(', '),
  };
}

function placeSearchResult(place) {
  return {
    ...place,
    kind: 'place',
    source: place?.source || 'google',
  };
}

function fulfilledValue(result, fallback = []) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

const UNIFIED_SEARCH_MIN_CHARS = Math.min(
  config.citySearchMinChars,
  config.googleMaps.searchMinChars
);

export function usePlaceSearch({ viewMode }) {
  const { t, locale } = useTranslation();
  const cityProviderRef = useRef(null);
  if (!cityProviderRef.current) cityProviderRef.current = createGeoapifyCityProvider();

  const searchAbortRef = useRef(null);
  const cityAutocompleteAbortRef = useRef(null);
  const googleAutocompleteAbortRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const cityAutocompleteSequenceRef = useRef(0);
  const googleAutocompleteSequenceRef = useRef(0);
  const suppressAutocompleteQueryRef = useRef('');
  const sessionTokenRef = useRef(createGooglePlacesSessionToken());

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [citySuggesting, setCitySuggesting] = useState(false);
  const [placeSuggesting, setPlaceSuggesting] = useState(false);
  const [errorState, setErrorState] = useState(null);

  const suggestions = useMemo(
    () => [...citySuggestions, ...placeSuggestions],
    [citySuggestions, placeSuggestions]
  );
  const suggesting = citySuggesting || placeSuggesting;

  function renewSession() {
    sessionTokenRef.current = createGooglePlacesSessionToken();
  }

  function abortAutocomplete() {
    cityAutocompleteAbortRef.current?.abort();
    googleAutocompleteAbortRef.current?.abort();
    cityAutocompleteSequenceRef.current += 1;
    googleAutocompleteSequenceRef.current += 1;
  }

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      cityAutocompleteAbortRef.current?.abort();
      googleAutocompleteAbortRef.current?.abort();
    },
    []
  );

  // Geoapify keeps its own threshold and debounce even though it shares the
  // visible search field with Google.
  useEffect(() => {
    cityAutocompleteAbortRef.current?.abort();
    const text = query.trim();

    if (
      viewMode !== 'places'
      || text.length < config.citySearchMinChars
      || suppressAutocompleteQueryRef.current === query
    ) {
      setCitySuggestions([]);
      setCitySuggesting(false);
      if (text.length < UNIFIED_SEARCH_MIN_CHARS) setShowSuggestions(false);
      return undefined;
    }

    const sequence = cityAutocompleteSequenceRef.current + 1;
    cityAutocompleteSequenceRef.current = sequence;
    const controller = new AbortController();
    cityAutocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      setCitySuggesting(true);
      try {
        const cities = await cityProviderRef.current.search(text, {
          signal: controller.signal,
          limit: 3,
          language: locale,
        });
        if (controller.signal.aborted || sequence !== cityAutocompleteSequenceRef.current) return;
        const next = cities.map(citySearchResult);
        setCitySuggestions(next);
        if (next.length) setShowSuggestions(true);
      } catch (error) {
        if (error?.name !== 'AbortError' && sequence === cityAutocompleteSequenceRef.current) {
          setCitySuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted && sequence === cityAutocompleteSequenceRef.current) {
          setCitySuggesting(false);
        }
      }
    }, config.citySearchDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locale, query, viewMode]);

  // Google keeps the stricter four-character / one-second policy independently.
  useEffect(() => {
    googleAutocompleteAbortRef.current?.abort();
    const text = query.trim();

    if (
      viewMode !== 'places'
      || text.length < config.googleMaps.searchMinChars
      || suppressAutocompleteQueryRef.current === query
    ) {
      setPlaceSuggestions([]);
      setPlaceSuggesting(false);
      return undefined;
    }

    const sequence = googleAutocompleteSequenceRef.current + 1;
    googleAutocompleteSequenceRef.current = sequence;
    const controller = new AbortController();
    googleAutocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      setPlaceSuggesting(true);
      try {
        const places = await autocompleteGooglePlaces(
          text,
          sessionTokenRef.current,
          { signal: controller.signal }
        );
        if (controller.signal.aborted || sequence !== googleAutocompleteSequenceRef.current) return;
        const next = places.map((place) => ({
          ...place,
          kind: 'place',
          source: 'google',
        }));
        setPlaceSuggestions(next);
        if (next.length) setShowSuggestions(true);
      } catch (error) {
        if (error?.name !== 'AbortError' && sequence === googleAutocompleteSequenceRef.current) {
          setPlaceSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted && sequence === googleAutocompleteSequenceRef.current) {
          setPlaceSuggesting(false);
        }
      }
    }, config.googleMaps.searchDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, viewMode]);

  async function submitSearch(event) {
    event?.preventDefault();
    const text = query.trim();
    if (text.length < UNIFIED_SEARCH_MIN_CHARS) {
      setErrorState({
        key: 'minimumSearchCharacters',
        variables: { count: UNIFIED_SEARCH_MIN_CHARS },
      });
      return;
    }

    abortAutocomplete();
    setCitySuggesting(false);
    setPlaceSuggesting(false);
    searchAbortRef.current?.abort();
    setShowSuggestions(false);
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setErrorState(null);

    const googleSearch = text.length >= config.googleMaps.searchMinChars
      ? searchGooglePlaces(text, { signal: controller.signal })
      : Promise.resolve([]);
    const citySearch = text.length >= config.citySearchMinChars
      ? cityProviderRef.current.search(text, {
          signal: controller.signal,
          limit: config.citySearchLimit,
          language: locale,
        })
      : Promise.resolve([]);

    const [googleResult, cityResult] = await Promise.allSettled([
      googleSearch,
      citySearch,
    ]);

    if (!controller.signal.aborted && sequence === searchSequenceRef.current) {
      const cities = fulfilledValue(cityResult).map(citySearchResult);
      const places = fulfilledValue(googleResult).map((place) => ({
        ...placeSearchResult(place),
        userLabel: text,
      }));
      setResults([...cities, ...places]);
      if (googleResult.status === 'rejected' && cityResult.status === 'rejected') {
        setErrorState({ key: 'placeSearchError' });
      }
      renewSession();
      setSearching(false);
    }
  }

  async function chooseSuggestion(prediction) {
    if (prediction?.kind === 'city') {
      abortAutocomplete();
      searchAbortRef.current?.abort();
      searchSequenceRef.current += 1;
      const label = prediction.displayName
        || [prediction.name, prediction.region, prediction.country].filter(Boolean).join(', ');
      suppressAutocompleteQueryRef.current = label;
      setQuery(label);
      setCitySuggestions([]);
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      setCitySuggesting(false);
      setPlaceSuggesting(false);
      setErrorState(null);
      setResults([citySearchResult(prediction)]);
      return;
    }

    const placeId = String(prediction?.id || '').trim();
    if (!placeId) return;
    const userLabel = query.trim();
    abortAutocomplete();
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    setCitySuggestions([]);
    setPlaceSuggestions([]);
    setShowSuggestions(false);
    setCitySuggesting(false);
    setPlaceSuggesting(false);
    setSearching(true);
    setErrorState(null);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const token = sessionTokenRef.current;

    try {
      const place = await resolveGooglePlace(prediction, token, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const location = [place.city, place.country].filter(Boolean).join(', ');
      const label = [place.name, location].filter(Boolean).join(', ');
      suppressAutocompleteQueryRef.current = label;
      setQuery(label);
      setResults([{ ...placeSearchResult(place), userLabel }]);
      renewSession();
    } catch (detailsError) {
      if (detailsError?.name !== 'AbortError') {
        setErrorState({ key: 'placeSearchError' });
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  const dismissResults = useCallback(() => {
    setResults([]);
    setCitySuggestions([]);
    setPlaceSuggestions([]);
    setShowSuggestions(false);
  }, []);

  function clearSearch() {
    abortAutocomplete();
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    suppressAutocompleteQueryRef.current = '';
    renewSession();
    setQuery('');
    setResults([]);
    setCitySuggestions([]);
    setPlaceSuggestions([]);
    setShowSuggestions(false);
    setCitySuggesting(false);
    setPlaceSuggesting(false);
    setSearching(false);
    setErrorState(null);
  }

  function handleQueryChange(event) {
    const next = event.target.value;
    suppressAutocompleteQueryRef.current = '';
    abortAutocomplete();
    setCitySuggesting(false);
    setPlaceSuggesting(false);
    setQuery(next);
    setErrorState(null);
    if (next.trim().length < config.citySearchMinChars) setCitySuggestions([]);
    if (next.trim().length < config.googleMaps.searchMinChars) setPlaceSuggestions([]);
    if (next.trim().length < UNIFIED_SEARCH_MIN_CHARS) setShowSuggestions(false);
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
    minChars: UNIFIED_SEARCH_MIN_CHARS,
    submitSearch,
    chooseSuggestion,
    dismissResults,
    clearSearch,
    handleQueryChange,
    showSuggestionsOnFocus,
  };
}
