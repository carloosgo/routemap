import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { loadGooglePlaceLocations } from '../places/googlePlacesClient.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { PlaceSearchForm } from './PlaceSearchForm.jsx';
import { loadGoogleMaps } from './googleMapsLoader.js';
import { markerElement, savePrompt, savedPlacePopup } from './placeMapDom.js';
import { usePlaceSearch } from './usePlaceSearch.js';

function geometryPaths(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates || []];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates || [];
  return [];
}

function toGooglePath(coordinates) {
  return coordinates
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function placeLabel(place, t) {
  return place.name || place.userLabel || t('place');
}

function savedMarkerContent(place, t) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'google-saved-place-marker';
  button.setAttribute('aria-label', placeLabel(place, t));
  const dot = document.createElement('span');
  dot.className = 'google-saved-place-marker__dot';
  button.append(dot);
  return button;
}

export function GooglePlacesMap({
  places = [],
  routeConnections = [],
  addPlace,
  active = false,
}) {
  const { t } = useTranslation();
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeLinesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);
  const [cachedLocations, setCachedLocations] = useState({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const placeSearch = usePlaceSearch({ viewMode: active ? 'places' : 'segments' });
  const mapConfigured = Boolean(
    config.googleMaps.webApiKey && config.googleMaps.mapId
  );

  const locatedPlaces = useMemo(
    () => places.map((place) => {
      if (isPlaced(place) || !isGooglePlaceReference(place)) return place;
      const location = cachedLocations[place.googlePlaceId];
      return location
        ? { ...place, lat: Number(location.lat), lon: Number(location.lon) }
        : place;
    }),
    [cachedLocations, places]
  );

  useEffect(() => {
    if (!active || !mapConfigured) return undefined;
    const placeIds = places
      .filter((place) => isGooglePlaceReference(place) && !isPlaced(place))
      .map((place) => place.googlePlaceId)
      .filter((placeId) => !cachedLocations[placeId]);
    if (!placeIds.length) return undefined;

    const controller = new AbortController();
    loadGooglePlaceLocations(placeIds, { signal: controller.signal })
      .then((locations) => {
        if (controller.signal.aborted) return;
        setCachedLocations((current) => {
          const next = { ...current };
          locations.forEach((location) => {
            if (location?.placeId && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lon))) {
              next[location.placeId] = {
                lat: Number(location.lat),
                lon: Number(location.lon),
              };
            }
          });
          return next;
        });
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.warn('[Google Places] cached location lookup failed', error);
        }
      });

    return () => controller.abort();
  }, [active, cachedLocations, mapConfigured, places]);

  useEffect(() => {
    let disposed = false;
    if (!nodeRef.current || !mapConfigured) return undefined;

    loadGoogleMaps()
      .then(async (maps) => {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
        ]);
        if (disposed || !nodeRef.current) return;
        const map = new Map(nodeRef.current, {
          center: { lat: config.map.initialCenter[0], lng: config.map.initialCenter[1] },
          zoom: config.map.initialZoom,
          mapId: config.googleMaps.mapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;
        mapRef.current.__AdvancedMarkerElement = AdvancedMarkerElement;
        infoWindowRef.current = new maps.InfoWindow();
        setReady(true);
      })
      .catch((error) => {
        if (!disposed) {
          console.error('[Google Maps] failed to load', error);
          setLoadError(t('googleMapLoadError'));
        }
      });

    return () => {
      disposed = true;
      clearTimeout(saveNoticeTimerRef.current);
      markersRef.current.forEach((marker) => { marker.map = null; });
      routeLinesRef.current.forEach((line) => line.setMap(null));
      infoWindowRef.current?.close();
      markersRef.current = [];
      routeLinesRef.current = [];
      mapRef.current = null;
      setReady(false);
    };
  }, [mapConfigured, t]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    const maps = globalThis.google?.maps;
    if (!map || !ready || !AdvancedMarkerElement || !maps) return undefined;

    markersRef.current.forEach((marker) => { marker.map = null; });
    markersRef.current = [];
    const bounds = new maps.LatLngBounds();

    locatedPlaces.filter(isPlaced).forEach((place) => {
      const content = savedMarkerContent(place, t);
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lon },
        title: placeLabel(place, t),
        content,
      });
      content.addEventListener('click', () => {
        infoWindowRef.current?.setContent(savedPlacePopup(place, t));
        infoWindowRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: place.lat, lng: place.lon });
    });

    const results = placeSearch.results.filter(isPlaced);
    results.forEach((place) => {
      const content = markerElement(place, t);
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lon },
        title: placeLabel(place, t),
        content,
        zIndex: 20,
      });
      content.addEventListener('click', () => {
        const alreadySaved = places.some(
          (saved) => saved.googlePlaceId
            ? saved.googlePlaceId === place.googlePlaceId
            : String(saved.id) === String(place.id)
        );
        const prompt = savePrompt(place, {
          alreadySaved,
          t,
          onSave: (selected) => {
            const savedPlace = {
              id: selected.id,
              provider: 'google',
              googlePlaceId: selected.googlePlaceId || selected.id,
              userLabel: selected.userLabel || '',
              name: selected.name || '',
              address: selected.address || '',
              city: selected.city || '',
              country: selected.country || '',
              countryCode: selected.countryCode || '',
              category: selected.category || '',
              lat: Number(selected.lat),
              lon: Number(selected.lon),
              savedAt: new Date().toISOString(),
            };
            if (!isPlaced(savedPlace)) return;
            addPlace?.(savedPlace);
            clearTimeout(saveNoticeTimerRef.current);
            setSaveNotice(t('placeSaved'));
            saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 2200);
          },
          onClose: () => infoWindowRef.current?.close(),
        });
        infoWindowRef.current?.setContent(prompt);
        infoWindowRef.current?.open({ map, anchor: marker });
        map.panTo({ lat: place.lat, lng: place.lon });
        if ((map.getZoom() || 0) < 14) map.setZoom(14);
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: place.lat, lng: place.lon });
    });

    if (results.length === 1) {
      map.panTo({ lat: results[0].lat, lng: results[0].lon });
      map.setZoom(14);
    } else if ((locatedPlaces.some(isPlaced) || results.length) && !bounds.isEmpty()) {
      map.fitBounds(bounds, 84);
    }

    return () => {
      markersRef.current.forEach((marker) => { marker.map = null; });
      markersRef.current = [];
    };
  }, [addPlace, locatedPlaces, placeSearch.results, places, ready, t]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = globalThis.google?.maps;
    if (!map || !ready || !maps) return undefined;
    routeLinesRef.current.forEach((line) => line.setMap(null));
    routeLinesRef.current = [];

    routeConnections
      .filter((route) => route.visible !== false && route.geometry)
      .flatMap((route) => geometryPaths(route.geometry))
      .forEach((coordinates) => {
        const path = toGooglePath(coordinates);
        if (path.length < 2) return;
        routeLinesRef.current.push(new maps.Polyline({
          map,
          path,
          strokeColor: '#111111',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          clickable: false,
          geodesic: true,
        }));
      });

    return () => {
      routeLinesRef.current.forEach((line) => line.setMap(null));
      routeLinesRef.current = [];
    };
  }, [ready, routeConnections]);

  return (
    <div className="geo-map-wrap google-map-wrap">
      <div className="geo-map google-map" ref={nodeRef}>
        {!mapConfigured && (
          <div className="geo-map__missing">{t('googleMapConfigMissingShort')}</div>
        )}
        {loadError && <div className="geo-map__missing">{loadError}</div>}
      </div>
      {active && mapConfigured && (
        <PlaceSearchForm
          query={placeSearch.query}
          suggestions={placeSearch.suggestions}
          showSuggestions={placeSearch.showSuggestions}
          searching={placeSearch.searching}
          suggesting={placeSearch.suggesting}
          error={placeSearch.error}
          canClearSearch={placeSearch.canClearSearch}
          minChars={placeSearch.minChars}
          onSubmit={placeSearch.submitSearch}
          onQueryChange={placeSearch.handleQueryChange}
          onFocus={placeSearch.showSuggestionsOnFocus}
          onClear={placeSearch.clearSearch}
          onChooseSuggestion={placeSearch.chooseSuggestion}
        />
      )}
      {routeConnections.some((route) => route.visible !== false && route.geometry) && (
        <div className="google-route-attribution">Powered by Google</div>
      )}
      {saveNotice && (
        <div className="toast" role="status" aria-live="polite">{saveNotice}</div>
      )}
    </div>
  );
}
