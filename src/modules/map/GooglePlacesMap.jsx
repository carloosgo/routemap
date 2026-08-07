import { useEffect, useRef, useState } from 'react';
import { config } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { refreshGooglePlace } from '../places/googlePlacesClient.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { PlaceSearchForm } from './PlaceSearchForm.jsx';
import { loadGoogleMaps } from './googleMapsLoader.js';
import { markerElement, savePrompt, savedPlacePopup } from './placeMapDom.js';
import { usePlaceSearch } from './usePlaceSearch.js';

const FALLBACK_GOOGLE_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f4f4f2' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#60646c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f4f2' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d8dadd' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#dedfdf' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#d3d4d5' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c8cacc' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e9eef0' }] },
];

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

function savedMarkerContent(place, t) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'google-saved-place-marker';
  button.setAttribute('aria-label', place.name || t('place'));
  const dot = document.createElement('span');
  dot.className = 'google-saved-place-marker__dot';
  button.append(dot);
  return button;
}

export function GooglePlacesMap({
  places = [],
  routeConnections = [],
  addPlace,
  updatePlace,
}) {
  const { t } = useTranslation();
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeLinesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);
  const hydratingPlaceIdsRef = useRef(new Set());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const placeSearch = usePlaceSearch({ viewMode: 'places' });

  useEffect(() => {
    const controller = new AbortController();
    const unresolved = places.filter(
      (place) => isGooglePlaceReference(place) && !isPlaced(place)
    );

    unresolved.forEach((place) => {
      if (hydratingPlaceIdsRef.current.has(place.id)) return;
      hydratingPlaceIdsRef.current.add(place.id);
      refreshGooglePlace(place.googlePlaceId, { signal: controller.signal })
        .then((hydrated) => {
          if (!controller.signal.aborted) updatePlace?.(place.id, hydrated);
        })
        .catch((error) => {
          if (error?.name !== 'AbortError') {
            console.warn('[Google Places] saved place refresh failed', error);
          }
        })
        .finally(() => hydratingPlaceIdsRef.current.delete(place.id));
    });

    return () => controller.abort();
  }, [places, updatePlace]);

  useEffect(() => {
    let disposed = false;
    if (!nodeRef.current || !config.googleMaps.webApiKey) return undefined;

    loadGoogleMaps()
      .then(async (maps) => {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
        ]);
        if (disposed || !nodeRef.current) return;
        const options = {
          center: { lat: config.map.initialCenter[0], lng: config.map.initialCenter[1] },
          zoom: config.map.initialZoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          ...(config.googleMaps.mapId
            ? { mapId: config.googleMaps.mapId }
            : { styles: FALLBACK_GOOGLE_STYLE }),
        };
        const map = new Map(nodeRef.current, options);
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
  }, [t]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    const maps = globalThis.google?.maps;
    if (!map || !ready || !AdvancedMarkerElement || !maps) return undefined;

    markersRef.current.forEach((marker) => { marker.map = null; });
    markersRef.current = [];
    const bounds = new maps.LatLngBounds();

    places.filter(isPlaced).forEach((place) => {
      const content = savedMarkerContent(place, t);
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lon },
        title: place.name || t('place'),
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
        title: place.name || t('place'),
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
    } else if ((places.some(isPlaced) || results.length) && !bounds.isEmpty()) {
      map.fitBounds(bounds, 84);
    }

    return () => {
      markersRef.current.forEach((marker) => { marker.map = null; });
      markersRef.current = [];
    };
  }, [addPlace, placeSearch.results, places, ready, t]);

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
        {!config.googleMaps.webApiKey && (
          <div className="geo-map__missing">{t('googleMapConfigMissingShort')}</div>
        )}
        {loadError && <div className="geo-map__missing">{loadError}</div>}
      </div>
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
      {routeConnections.some((route) => route.visible !== false && route.geometry) && (
        <div className="google-route-attribution">Powered by Google</div>
      )}
      {saveNotice && (
        <div className="toast" role="status" aria-live="polite">{saveNotice}</div>
      )}
    </div>
  );
}
