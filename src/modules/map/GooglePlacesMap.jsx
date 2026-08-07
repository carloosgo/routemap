import { useEffect, useMemo, useRef, useState } from 'react';
import { config, colorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { loadGooglePlaceLocations } from '../places/googlePlacesClient.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { PlaceSearchForm } from './PlaceSearchForm.jsx';
import { loadGoogleMaps } from './googleMapsLoader.js';
import { markerElement, savePrompt, savedPlacePopup } from './placeMapDom.js';
import { buildMapFeatureData, cityKey, placeCountryKey } from './routeMapModel.js';
import { savedPlaceMarkerStyle } from './savedPlaceMarkerPalette.js';
import { savedPlacePinUrl } from './savedPlaceSymbol.js';
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

function savedMarkerContent(place, t, color) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'google-saved-place-marker';
  button.setAttribute('aria-label', placeLabel(place, t));
  const image = document.createElement('img');
  image.src = savedPlacePinUrl(color);
  image.width = 26;
  image.height = 28;
  image.alt = '';
  image.decoding = 'async';
  button.append(image);
  return button;
}

function itineraryCityContent(city, color, t) {
  const marker = document.createElement('div');
  marker.className = 'google-itinerary-city-marker';
  marker.style.setProperty('--itinerary-city-color', color);
  marker.setAttribute('role', 'img');
  marker.setAttribute('aria-label', city.name || city.displayName || t('city'));
  const dot = document.createElement('span');
  dot.className = 'google-itinerary-city-marker__dot';
  marker.append(dot);
  return marker;
}

function clearAdvancedMarkers(markersRef) {
  markersRef.current.forEach((marker) => { marker.map = null; });
  markersRef.current = [];
}

function clearPolylines(linesRef) {
  linesRef.current.forEach((line) => line.setMap(null));
  linesRef.current = [];
}

function syncMapElementSize(wrapper, node) {
  if (!wrapper || !node) return false;
  const width = Math.floor(wrapper.clientWidth);
  const height = Math.floor(wrapper.clientHeight);
  if (width < 2 || height < 2) return false;

  const widthPx = `${width}px`;
  const heightPx = `${height}px`;
  if (node.style.width !== widthPx) node.style.width = widthPx;
  if (node.style.height !== heightPx) node.style.height = heightPx;
  return true;
}

function afterLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function GooglePlacesMap({
  segments = [],
  places = [],
  routeConnections = [],
  addPlace,
  viewMode = 'segments',
}) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const placeMarkersRef = useRef([]);
  const savedRouteLinesRef = useRef([]);
  const itineraryMarkersRef = useRef([]);
  const itineraryLinesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);
  const lastItineraryViewportKeyRef = useRef(null);
  const [cachedLocations, setCachedLocations] = useState({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const placesActive = viewMode === 'places';
  const placeSearch = usePlaceSearch({ viewMode });
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

  const savedMarkerColors = useMemo(() => {
    const countryIndexes = new Map();
    const colors = new Map();
    let nextCountryIndex = 0;
    locatedPlaces.forEach((place) => {
      const countryKey = placeCountryKey(place);
      if (!countryIndexes.has(countryKey)) {
        countryIndexes.set(countryKey, nextCountryIndex);
        nextCountryIndex += 1;
      }
      colors.set(place.id, savedPlaceMarkerStyle(countryIndexes.get(countryKey)).color);
    });
    return colors;
  }, [locatedPlaces]);

  useEffect(() => {
    if (!placesActive || !mapConfigured) return undefined;
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
            if (
              location?.placeId
              && Number.isFinite(Number(location.lat))
              && Number.isFinite(Number(location.lon))
            ) {
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
  }, [placesActive, cachedLocations, mapConfigured, places]);

  useEffect(() => {
    let disposed = false;
    let resizeHandler = null;
    if (!wrapRef.current || !nodeRef.current || !mapConfigured) return undefined;

    syncMapElementSize(wrapRef.current, nodeRef.current);

    loadGoogleMaps()
      .then(async (maps) => {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
        ]);
        await afterLayout();
        if (disposed || !wrapRef.current || !nodeRef.current) return;

        syncMapElementSize(wrapRef.current, nodeRef.current);
        const map = new Map(nodeRef.current, {
          center: {
            lat: config.map.initialCenter[0],
            lng: config.map.initialCenter[1],
          },
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

        resizeHandler = () => {
          if (!syncMapElementSize(wrapRef.current, nodeRef.current)) return;
          const currentMap = mapRef.current;
          if (!currentMap) return;
          const center = currentMap.getCenter();
          const zoom = currentMap.getZoom();
          maps.event.trigger(currentMap, 'resize');
          if (center) currentMap.setCenter(center);
          if (Number.isFinite(zoom)) currentMap.setZoom(zoom);
        };

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserverRef.current = new ResizeObserver(resizeHandler);
          resizeObserverRef.current.observe(wrapRef.current);
        }
        globalThis.addEventListener?.('resize', resizeHandler);
        requestAnimationFrame(resizeHandler);
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
      if (resizeHandler) globalThis.removeEventListener?.('resize', resizeHandler);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      clearTimeout(saveNoticeTimerRef.current);
      clearAdvancedMarkers(placeMarkersRef);
      clearAdvancedMarkers(itineraryMarkersRef);
      clearPolylines(savedRouteLinesRef);
      clearPolylines(itineraryLinesRef);
      infoWindowRef.current?.close();
      mapRef.current = null;
      setReady(false);
    };
  }, [mapConfigured, t]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = globalThis.google?.maps;
    if (!map || !ready || !maps) return undefined;
    const frame = requestAnimationFrame(() => {
      if (!syncMapElementSize(wrapRef.current, nodeRef.current)) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      maps.event.trigger(map, 'resize');
      if (center) map.setCenter(center);
      if (Number.isFinite(zoom)) map.setZoom(zoom);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    const maps = globalThis.google?.maps;
    clearAdvancedMarkers(itineraryMarkersRef);
    clearPolylines(itineraryLinesRef);
    if (!map || !ready || !AdvancedMarkerElement || !maps || placesActive) {
      return undefined;
    }

    const { routeFeatures, cityFeatures, routeCities } = buildMapFeatureData({
      segments,
      places: [],
      routeConnections: [],
      viewMode: 'segments',
      colorForIndex,
    });

    routeFeatures.forEach((feature) => {
      const path = toGooglePath(feature.geometry?.coordinates || []);
      if (path.length < 2) return;
      const color = feature.properties?.color || '#111111';
      const dashed = feature.properties?.dashed === true;
      const line = new maps.Polyline({
        map,
        path,
        strokeColor: color,
        strokeOpacity: dashed ? 0 : 0.92,
        strokeWeight: 3,
        clickable: false,
        geodesic: false,
        icons: dashed
          ? [{
              icon: {
                path: 'M 0,-1 0,1',
                strokeColor: color,
                strokeOpacity: 0.95,
                strokeWeight: 2,
                scale: 2,
              },
              offset: '0',
              repeat: '12px',
            }]
          : undefined,
      });
      itineraryLinesRef.current.push(line);
    });

    const bounds = new maps.LatLngBounds();
    cityFeatures.forEach((feature) => {
      const [lng, lat] = feature.geometry?.coordinates || [];
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      const content = itineraryCityContent(
        { name: feature.properties?.name },
        feature.properties?.color || colorForIndex(0),
        t
      );
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: Number(lat), lng: Number(lng) },
        title: feature.properties?.name || t('city'),
        content,
      });
      itineraryMarkersRef.current.push(marker);
      bounds.extend({ lat: Number(lat), lng: Number(lng) });
    });

    const viewportKey = routeCities.map(cityKey).join('|');
    if (viewportKey !== lastItineraryViewportKeyRef.current) {
      lastItineraryViewportKeyRef.current = viewportKey;
      if (routeCities.length === 1) {
        map.panTo({ lat: routeCities[0].lat, lng: routeCities[0].lon });
        map.setZoom(10);
      } else if (routeCities.length > 1 && !bounds.isEmpty()) {
        map.fitBounds(bounds, 84);
      }
    }

    return () => {
      clearAdvancedMarkers(itineraryMarkersRef);
      clearPolylines(itineraryLinesRef);
    };
  }, [placesActive, ready, segments, t]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    const maps = globalThis.google?.maps;
    clearAdvancedMarkers(placeMarkersRef);
    if (!map || !ready || !AdvancedMarkerElement || !maps || !placesActive) {
      return undefined;
    }

    const bounds = new maps.LatLngBounds();

    locatedPlaces.filter(isPlaced).forEach((place) => {
      const content = savedMarkerContent(
        place,
        t,
        savedMarkerColors.get(place.id) || savedPlaceMarkerStyle(0).color
      );
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
      placeMarkersRef.current.push(marker);
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
      placeMarkersRef.current.push(marker);
      bounds.extend({ lat: place.lat, lng: place.lon });
    });

    if (results.length === 1) {
      map.panTo({ lat: results[0].lat, lng: results[0].lon });
      map.setZoom(14);
    } else if ((locatedPlaces.some(isPlaced) || results.length) && !bounds.isEmpty()) {
      map.fitBounds(bounds, 84);
    }

    return () => clearAdvancedMarkers(placeMarkersRef);
  }, [addPlace, locatedPlaces, placeSearch.results, places, placesActive, ready, savedMarkerColors, t]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = globalThis.google?.maps;
    clearPolylines(savedRouteLinesRef);
    if (!map || !ready || !maps || !placesActive) return undefined;

    routeConnections
      .filter((route) => route.visible !== false && route.geometry)
      .flatMap((route) => geometryPaths(route.geometry))
      .forEach((coordinates) => {
        const path = toGooglePath(coordinates);
        if (path.length < 2) return;
        savedRouteLinesRef.current.push(new maps.Polyline({
          map,
          path,
          strokeColor: '#111111',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          clickable: false,
          geodesic: true,
        }));
      });

    return () => clearPolylines(savedRouteLinesRef);
  }, [placesActive, ready, routeConnections]);

  return (
    <div className="geo-map-wrap google-map-wrap" ref={wrapRef}>
      <div className="geo-map google-map" ref={nodeRef} />
      {!mapConfigured && (
        <div className="geo-map__missing">{t('googleMapConfigMissingShort')}</div>
      )}
      {loadError && <div className="geo-map__missing">{loadError}</div>}
      {placesActive && mapConfigured && (
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
      {placesActive && routeConnections.some(
        (route) => route.visible !== false && route.geometry
      ) && (
        <div className="google-route-attribution">Powered by Google</div>
      )}
      {saveNotice && (
        <div className="toast" role="status" aria-live="polite">{saveNotice}</div>
      )}
    </div>
  );
}
