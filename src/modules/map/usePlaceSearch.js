import { useCallback, useEffect, useRef, useState } from 'react';
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

export function usePlaceSearch({ viewMode }) {
  const { t, locale } = useTranslation();
  const cityProviderRef = useRef(null);
  if (!cityProviderRef.current) cityProviderRef.current = createGeoapifyCityProvider();

  const searchAbortRef = useRef(null);
  const autocompleteAbortRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const autocompleteSequenceRef = useRef(0);
  const skipAutocompleteRef = useRef(false);
  const previousViewModeRef = useRef(viewMode);
  const sessionTokenRef = useRef(createGooglePlacesSessionToken());

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [errorState, setErrorState] = useState(null);

  function renewSession() {
    sessionTokenRef.current = createGooglePlacesSessionToken();
  }

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      autocompleteAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    const previousViewMode = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;
    autocompleteAbortRef.current?.abort();

    if (viewMode !== 'places') {
      setSuggestions([]);
      setSuggesting(false);
      setShowSuggestions(false);
      return undefined;
    }

    if (previousViewMode !== 'places') {
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

    if (text.length < config.googleMaps.searchMinChars) {
      setSuggestions([]);
      setSuggesting(false);
      setShowSuggestions(false);
      return undefined;
    }

    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      setSuggesting(true);
      const [googleResult, cityResult] = await Promise.allSettled([
        autocompleteGooglePlaces(
          text,
          sessionTokenRef.current,
          { signal: controller.signal }
        ),
        cityProviderRef.current.search(text, {
          signal: controller.signal,
          limit: 3,
          language: locale,
        }),
      ]);

      if (!controller.signal.aborted && sequence === autocompleteSequenceRef.current) {
        const citySuggestions = fulfilledValue(cityResult).map(citySearchResult);
        const placeSuggestions = fulfilledValue(googleResult).map((place) => ({
          ...place,
          kind: 'place',
          source: 'google',
        }));
        setSuggestions([...citySuggestions, ...placeSuggestions]);
        setShowSuggestions(citySuggestions.length + placeSuggestions.length > 0);
        setSuggesting(false);
      }
    }, config.googleMaps.searchDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locale, query, viewMode]);

  async function submitSearch(event) {
    event?.preventDefault();
    const text = query.trim();
    if (text.length < config.googleMaps.searchMinChars) {
      setErrorState({
        key: 'minimumSearchCharacters',
        variables: { count: config.googleMaps.searchMinChars },
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

    const [googleResult, cityResult] = await Promise.allSettled([
      searchGooglePlaces(text, { signal: controller.signal }),
      cityProviderRef.current.search(text, {
        signal: controller.signal,
        limit: config.citySearchLimit,
        language: locale,
      }),
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
      autocompleteAbortRef.current?.abort();
      autocompleteSequenceRef.current += 1;
      searchAbortRef.current?.abort();
      searchSequenceRef.current += 1;
      skipAutocompleteRef.current = true;
      const label = prediction.displayName
        || [prediction.name, prediction.region, prediction.country].filter(Boolean).join(', ');
      setQuery(label);
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggesting(false);
      setErrorState(null);
      setResults([citySearchResult(prediction)]);
      return;
    }

    const placeId = String(prediction?.id || '').trim();
    if (!placeId) return;
    const userLabel = query.trim();
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggesting(false);
    setSearching(true);
    setErrorState(null);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const token = sessionTokenRef.current;

    try {
      const place = await resolveGooglePlace(prediction, token, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const location = [place.city, place.country].filter(Boolean).join(', ');
      skipAutocompleteRef.current = true;
      setQuery([place.name, location].filter(Boolean).join(', '));
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
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  function clearSearch() {
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    skipAutocompleteRef.current = false;
    renewSession();
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
    if (next.trim().length < config.googleMaps.searchMinChars) {
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
    minChars: config.googleMaps.searchMinChars,
    submitSearch,
    chooseSuggestion,
    dismissResults,
    clearSearch,
    handleQueryChange,
    showSuggestionsOnFocus,
  };
}
