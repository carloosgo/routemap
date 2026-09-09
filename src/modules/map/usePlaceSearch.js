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
import {
  matchingCityResults,
  preferredSearchProvider,
} from './searchIntentRouter.js';

function citySearchResult(city) {
  const canonical = canonicalCityFromSearchResult(city);
  return {
    ...canonical,
    kind: 'city',
    source: 'geoapify',
    region: city?.region || '',
    regionCode: city?.regionCode || '',
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

const UNIFIED_SEARCH_MIN_CHARS = Math.min(
  config.citySearchMinChars,
  config.googleMaps.searchMinChars
);

function waitFor(delay, signal) {
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export function usePlaceSearch({ viewMode }) {
  const { t, locale } = useTranslation();
  const cityProviderRef = useRef(null);
  if (!cityProviderRef.current) cityProviderRef.current = createGeoapifyCityProvider();

  const searchAbortRef = useRef(null);
  const autocompleteAbortRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const autocompleteSequenceRef = useRef(0);
  const suppressAutocompleteQueryRef = useRef('');
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

  function abortAutocomplete() {
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
  }

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      autocompleteAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    autocompleteAbortRef.current?.abort();
    const text = query.trim();

    if (
      viewMode !== 'places'
      || text.length < UNIFIED_SEARCH_MIN_CHARS
      || suppressAutocompleteQueryRef.current === query
    ) {
      setSuggestions([]);
      setSuggesting(false);
      setShowSuggestions(false);
      return undefined;
    }

    const sequence = autocompleteSequenceRef.current + 1;
    autocompleteSequenceRef.current = sequence;
    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    const preferredProvider = preferredSearchProvider(text);
    const startedAt = Date.now();
    const initialDelay = preferredProvider === 'google'
      ? config.googleMaps.searchDebounceMs
      : config.citySearchDebounceMs;

    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        if (preferredProvider === 'city') {
          let cities = [];
          try {
            cities = await cityProviderRef.current.search(text, {
              signal: controller.signal,
              limit: config.citySearchLimit,
              language: locale,
            });
          } catch (cityError) {
            if (cityError?.name === 'AbortError') throw cityError;
          }

          if (controller.signal.aborted || sequence !== autocompleteSequenceRef.current) return;
          const matchingCities = matchingCityResults(cities, text);
          if (matchingCities.length) {
            setSuggestions(matchingCities.map(citySearchResult));
            setShowSuggestions(true);
            return;
          }

          if (text.length < config.googleMaps.searchMinChars) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
          }

          const elapsed = Date.now() - startedAt;
          await waitFor(
            Math.max(0, config.googleMaps.searchDebounceMs - elapsed),
            controller.signal
          );
        }

        if (text.length < config.googleMaps.searchMinChars) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        const places = await autocompleteGooglePlaces(
          text,
          sessionTokenRef.current,
          { signal: controller.signal }
        );
        if (controller.signal.aborted || sequence !== autocompleteSequenceRef.current) return;
        setSuggestions(places.map((place) => ({
          ...place,
          kind: 'place',
          source: 'google',
        })));
        setShowSuggestions(places.length > 0);
      } catch (error) {
        if (error?.name !== 'AbortError' && sequence === autocompleteSequenceRef.current) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        if (!controller.signal.aborted && sequence === autocompleteSequenceRef.current) {
          setSuggesting(false);
        }
      }
    }, initialDelay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locale, query, viewMode]);

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
      const preferredProvider = preferredSearchProvider(text);
      if (preferredProvider === 'city') {
        let cities = [];
        try {
          cities = await cityProviderRef.current.search(text, {
            signal: controller.signal,
            limit: config.citySearchLimit,
            language: locale,
          });
        } catch (cityError) {
          if (cityError?.name === 'AbortError') throw cityError;
        }
        if (controller.signal.aborted || sequence !== searchSequenceRef.current) return;
        const matchingCities = matchingCityResults(cities, text);
        if (matchingCities.length) {
          setResults(matchingCities.map(citySearchResult));
          return;
        }
      }

      if (text.length < config.googleMaps.searchMinChars) {
        setResults([]);
        return;
      }
      const places = await searchGooglePlaces(text, { signal: controller.signal });
      if (controller.signal.aborted || sequence !== searchSequenceRef.current) return;
      setResults(places.map((place) => ({
        ...placeSearchResult(place),
        userLabel: text,
      })));
      renewSession();
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

  async function chooseSuggestion(prediction) {
    if (prediction?.kind === 'city') {
      abortAutocomplete();
      searchAbortRef.current?.abort();
      searchSequenceRef.current += 1;
      const label = prediction.displayName
        || [prediction.name, prediction.region, prediction.country].filter(Boolean).join(', ');
      suppressAutocompleteQueryRef.current = label;
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
    abortAutocomplete();
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
    setSuggestions([]);
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
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggesting(false);
    setSearching(false);
    setErrorState(null);
  }

  function handleQueryChange(event) {
    const next = event.target.value;
    suppressAutocompleteQueryRef.current = '';
    abortAutocomplete();
    setSuggesting(false);
    setQuery(next);
    setErrorState(null);
    if (next.trim().length < UNIFIED_SEARCH_MIN_CHARS) {
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
    minChars: UNIFIED_SEARCH_MIN_CHARS,
    submitSearch,
    chooseSuggestion,
    dismissResults,
    clearSearch,
    handleQueryChange,
    showSuggestionsOnFocus,
  };
}
