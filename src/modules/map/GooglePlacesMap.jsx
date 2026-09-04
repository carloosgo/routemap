import { useEffect, useMemo, useRef, useState } from 'react';
import { config, colorForIndex, countryColorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { loadGooglePlaceLocations } from '../places/googlePlacesClient.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { PlaceSearchForm } from './PlaceSearchForm.jsx';
import { visitedCountries } from './countryColoring.js';
import { createCrispDashedRoutes } from './crispDashedRoutes.js';
import {
  cachedGoogleCountryPlaceIds,
  loadGoogleCountryPlaceIds,
} from './googleCountryBoundariesClient.js';
import { loadGoogleMaps } from './googleMapsLoader.js';
import { itineraryLandmarksFromFeatures } from './itineraryLandmarkCatalog.js';
import { markerElement, savedPlacePopup } from './placeMapDom.js';
import { buildMapFeatureData, cityKey, placeCountryKey } from './routeMapModel.js';
import { savedPlaceMarkerStyle } from './savedPlaceMarkerPalette.js';
import { savedPlacePinUrl } from './savedPlaceSymbol.js';
import { usePlaceSearch } from './usePlaceSearch.js';
import { createWebglLandmarkOverlay } from './webglLandmarkOverlay.js';

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

function itineraryFlag(kind) {
  const flag = document.createElement('span');
  flag.className = `google-itinerary-city-marker__flag google-itinerary-city-marker__flag--${kind}`;
  flag.setAttribute('aria-hidden', 'true');
  return flag;
}

function updateItineraryCityContent(marker, city, color, t, {
  origin = false,
  visits = [],
  finish = false,
} = {}) {
  marker.className = 'google-itinerary-city-marker'
    + (origin ? ' is-origin' : '')
    + (finish ? ' is-finish' : '')
    + (visits.length > 1 ? ' has-repeated-visits' : '');
  if (color) marker.style.setProperty('--itinerary-city-color', color);
  else marker.style.removeProperty('--itinerary-city-color');
  marker.setAttribute('role', 'img');
  const cityName = city.name || city.displayName || t('city');
  const normalizedVisits = visits
    .map((visit) => ({
      sequence: Number(visit?.sequence) || null,
      color: visit?.color || color || null,
    }))
    .filter((visit) => visit.sequence != null);
  const numbers = normalizedVisits.map((visit) => visit.sequence);

  if (origin && numbers.length) {
    marker.setAttribute(
      'aria-label',
      `${t('origin')}: ${cityName} · ${numbers.join(', ')}. ${cityName}`
    );
  } else if (origin) {
    marker.setAttribute('aria-label', `${t('origin')}: ${cityName}`);
  } else if (numbers.length) {
    marker.setAttribute('aria-label', `${numbers.join(', ')}. ${cityName}`);
  } else {
    marker.setAttribute('aria-label', cityName);
  }

  marker.replaceChildren();
  if (origin) marker.append(itineraryFlag('origin'));

  normalizedVisits.forEach((visit) => {
    const dot = document.createElement('span');
    dot.className = 'google-itinerary-city-marker__dot';
    dot.style.setProperty(
      '--itinerary-visit-color',
      visit.color || color || '#111111'
    );
    dot.textContent = String(visit.sequence);
    marker.append(dot);
  });

  if (finish) marker.append(itineraryFlag('finish'));
}

function itineraryCityContent(city, color, t, options = {}) {
  const marker = document.createElement('div');
  updateItineraryCityContent(marker, city, color, t, options);
  return marker;
}

function clearAdvancedMarkers(markersRef) {
  const markers = markersRef.current;
  markersRef.current = [];
  if (!markers.length) return;

  const detach = () => {
    markers.forEach((marker) => { marker.map = null; });
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(detach);
  } else {
    detach();
  }
}

function clearItineraryMarkers(markersByKeyRef) {
  markersByKeyRef.current.forEach(({ marker }) => {
    marker.map = null;
  });
  markersByKeyRef.current.clear();
}

function itineraryFeatureKey(feature) {
  const [lng, lat] = feature?.geometry?.coordinates || [];
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return '';
  return `${numericLat.toFixed(6)},${numericLng.toFixed(6)}`;
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

function sameSavedPlace(saved, result) {
  if (saved?.googlePlaceId && result?.googlePlaceId) {
    return saved.googlePlaceId === result.googlePlaceId;
  }
  return String(saved?.id || '') === String(result?.id || '');
}
function placeForSaving(selected) {
  return {
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
  const savedPlaceMarkersRef = useRef([]);
  const resultPlaceMarkersRef = useRef([]);
  const savedRouteLinesRef = useRef([]);
  const itineraryMarkersByKeyRef = useRef(new Map());
  const itineraryRoutesOverlayRef = useRef(null);
  const itineraryLandmarkOverlayRef = useRef(null);
  const infoWindowRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);
  const lastItineraryViewportKeyRef = useRef(null);
  const firstDestination = isPlaced(segments?.[0]?.destination)
    ? segments[0].destination
    : null;
  const firstDestinationKey = firstDestination ? cityKey(firstDestination) : '';
  const firstDestinationKeyRef = useRef(firstDestinationKey);
  const pendingFirstDestinationFocusRef = useRef(null);
  const countryLayerWarningRef = useRef(false);
  const [cachedLocations, setCachedLocations] = useState({});
  const [ready, setReady] = useState(false);
  const [loadErrorKey, setLoadErrorKey] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const placesActive = viewMode === 'places';
  const placeSearch = usePlaceSearch({ viewMode });
  const {
    dismissResults: dismissPlaceSearchResults,
    results: placeSearchResults,
  } = placeSearch;
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

  const itineraryCountries = useMemo(
    () => visitedCountries(segments, countryColorForIndex)
      .map(({ countryCode, city, color }) => ({
        countryCode,
        country: String(city?.country || '').trim(),
        color,
      }))
      .filter((country) => country.countryCode && country.country),
    [segments]
  );

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
        const [mapsLibrary, { AdvancedMarkerElement }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
        ]);
        const { Map, RenderingType } = mapsLibrary;
        const { WebGLOverlayView } = mapsLibrary;
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
          renderingType: RenderingType.VECTOR,
          mapTypeControl: false,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          tiltInteractionEnabled: false,
          headingInteractionEnabled: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;
        mapRef.current.__AdvancedMarkerElement = AdvancedMarkerElement;
        itineraryLandmarkOverlayRef.current = createWebglLandmarkOverlay({
          WebGLOverlayView,
          map,
        });
        infoWindowRef.current = new maps.InfoWindow({
          headerDisabled: true,
          disableAutoPan: true,
        });

        maps.event.addListenerOnce(map, 'tilesloaded', () => {
          const actualRenderingType = map.getRenderingType?.();
          if (actualRenderingType && actualRenderingType !== RenderingType.VECTOR) {
            console.warn('[Google Maps] vector rendering unavailable; browser fell back to raster.');
          }
        });

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
          setLoadErrorKey('googleMapLoadError');
        }
      });

    return () => {
      disposed = true;
      if (resizeHandler) globalThis.removeEventListener?.('resize', resizeHandler);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      clearTimeout(saveNoticeTimerRef.current);
      clearAdvancedMarkers(savedPlaceMarkersRef);
      clearAdvancedMarkers(resultPlaceMarkersRef);
      clearItineraryMarkers(itineraryMarkersByKeyRef);
      clearPolylines(savedRouteLinesRef);
      itineraryRoutesOverlayRef.current?.dispose();
      itineraryRoutesOverlayRef.current = null;
      itineraryLandmarkOverlayRef.current?.dispose();
      itineraryLandmarkOverlayRef.current = null;
      infoWindowRef.current?.close();
      mapRef.current = null;
      setReady(false);
    };
  }, [mapConfigured]);

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
      itineraryRoutesOverlayRef.current?.refresh();
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    const countryLayer = map.getFeatureLayer?.('COUNTRY');
    if (!countryLayer) return undefined;

    let disposed = false;
    let controller = null;

    const applyResolvedCountryStyle = (resolvedCountries) => {
      if (disposed) return;
      const colorsByCode = new Map(
        itineraryCountries.map((country) => [country.countryCode, country.color])
      );
      const colorsByPlaceId = new Map();
      resolvedCountries.forEach((country) => {
        const color = colorsByCode.get(country.countryCode);
        if (country?.placeId && color) colorsByPlaceId.set(country.placeId, color);
      });
      countryLayer.style = ({ feature }) => {
        const color = colorsByPlaceId.get(feature?.placeId);
        if (!color) return null;
        return {
          fillColor: color,
          fillOpacity: 0.16,
          strokeOpacity: 0,
          strokeWeight: 0,
        };
      };
    };

    const applyCountryStyle = () => {
      if (disposed) return;
      controller?.abort();
      controller = null;

      if (placesActive || !itineraryCountries.length) {
        countryLayer.style = null;
        return;
      }

      const capabilities = map.getMapCapabilities?.();
      const dataDrivenAvailable = capabilities?.isDataDrivenStylingAvailable !== false;
      if (!dataDrivenAvailable || !countryLayer.isAvailable) {
        countryLayer.style = null;
        if (!countryLayerWarningRef.current) {
          countryLayerWarningRef.current = true;
          console.warn('[Google Maps] COUNTRY feature layer is not enabled for this Map ID style.');
        }
        return;
      }

      countryLayerWarningRef.current = false;
      const cachedCountries = cachedGoogleCountryPlaceIds(itineraryCountries);
      applyResolvedCountryStyle(cachedCountries);
      if (cachedCountries.length === itineraryCountries.length) return;

      controller = new AbortController();
      const currentController = controller;
      loadGoogleCountryPlaceIds(itineraryCountries, { signal: currentController.signal })
        .then((resolvedCountries) => {
          if (disposed || currentController.signal.aborted) return;
          applyResolvedCountryStyle(resolvedCountries);
        })
        .catch((error) => {
          if (error?.name !== 'AbortError') {
            console.warn('[Google Maps] country boundary styling failed', error);
          }
        });
    };

    applyCountryStyle();
    const capabilityListener = map.addListener?.('mapcapabilities_changed', applyCountryStyle);

    return () => {
      disposed = true;
      controller?.abort();
      capabilityListener?.remove?.();
    };
  }, [itineraryCountries, placesActive, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    const maps = globalThis.google?.maps;
    const landmarkOverlay = itineraryLandmarkOverlayRef.current;
    if (!map || !ready || !AdvancedMarkerElement || !maps || placesActive) {
      if (placesActive) clearItineraryMarkers(itineraryMarkersByKeyRef);
      itineraryRoutesOverlayRef.current?.setRoutes([]);
      landmarkOverlay?.setLandmarks([]);
      return undefined;
    }

    const { routeFeatures, cityFeatures, routeCities } = buildMapFeatureData({
      segments,
      places: [],
      routeConnections: [],
      viewMode: 'segments',
      colorForIndex,
    });
    landmarkOverlay?.setLandmarks(itineraryLandmarksFromFeatures(cityFeatures));
    const routes = routeFeatures
      .map((feature) => ({
        path: toGooglePath(feature.geometry?.coordinates || []),
        color: feature.properties?.color || '#111111',
      }))
      .filter((route) => route.path.length >= 2);

    let routeOverlay = itineraryRoutesOverlayRef.current;
    if (!routeOverlay) {
      routeOverlay = createCrispDashedRoutes({ maps, map, routes });
      itineraryRoutesOverlayRef.current = routeOverlay;
    } else {
      routeOverlay.setRoutes(routes);
    }

    let viewportIdleListener = null;
    let routeRefreshFrame = 0;

    const refreshRoutes = () => {
      if (routeRefreshFrame) cancelAnimationFrame(routeRefreshFrame);
      routeRefreshFrame = requestAnimationFrame(() => {
        routeRefreshFrame = 0;
        itineraryRoutesOverlayRef.current?.refresh();
      });
    };

    const bounds = new maps.LatLngBounds();
    const nextMarkerKeys = new Set();
    cityFeatures.forEach((feature) => {
      const [lng, lat] = feature.geometry?.coordinates || [];
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      const markerKey = itineraryFeatureKey(feature);
      if (!markerKey) return;
      const isOrigin = feature.properties?.role === 'origin';
      const isFinish = Boolean(feature.properties?.isFinish);
      const markerVisits = (Array.isArray(feature.properties?.visits)
        ? feature.properties.visits
        : [])
        .map((visit) => ({
          sequence: Number(visit?.sequence) || null,
          color: visit?.color || null,
        }))
        .filter((visit) => visit.sequence != null);
      if (!isOrigin && !isFinish && markerVisits.length === 0) return;
      const cityName = feature.properties?.name || t('city');
      const markerColor = markerVisits[0]?.color
        || feature.properties?.color
        || colorForIndex(0);
      const markerPosition = { lat: Number(lat), lng: Number(lng) };
      const markerNumbers = markerVisits.map((visit) => visit.sequence);
      const markerTitle = markerNumbers.length
        ? `${markerNumbers.join(', ')} · ${cityName}`
        : cityName;
      const maxMarkerNumber = markerNumbers.length ? Math.max(...markerNumbers) : 0;
      const markerZIndex = isFinish
        ? 380
        : isOrigin
          ? 350
          : 300 + maxMarkerNumber;
      const markerOptions = {
        origin: isOrigin,
        visits: markerVisits,
        finish: isFinish,
      };
      const existing = itineraryMarkersByKeyRef.current.get(markerKey);

      if (existing) {
        updateItineraryCityContent(
          existing.content,
          { name: cityName },
          markerColor,
          t,
          markerOptions
        );
        existing.marker.position = markerPosition;
        existing.marker.title = markerTitle;
        existing.marker.zIndex = markerZIndex;
        existing.marker.map = map;
      } else {
        const content = itineraryCityContent(
          { name: cityName },
          markerColor,
          t,
          markerOptions
        );
        const marker = new AdvancedMarkerElement({
          map,
          position: markerPosition,
          title: markerTitle,
          content,
          zIndex: markerZIndex,
        });
        itineraryMarkersByKeyRef.current.set(markerKey, { marker, content });
      }

      nextMarkerKeys.add(markerKey);
      bounds.extend(markerPosition);
    });

    itineraryMarkersByKeyRef.current.forEach((state, markerKey) => {
      if (nextMarkerKeys.has(markerKey)) return;
      state.marker.map = null;
      itineraryMarkersByKeyRef.current.delete(markerKey);
    });

    const viewportKey = routeCities.map(cityKey).sort().join('|');
    const firstItineraryProjection = lastItineraryViewportKeyRef.current === null;
    lastItineraryViewportKeyRef.current = viewportKey;

    /* El viewport pertenece al usuario después de la primera proyección. Cargar
       un itinerario ya existente puede encuadrarlo una vez; agregar, eliminar o
       reordenar ciudades nunca vuelve a ejecutar movimientos automáticos de cámara.
       La selección inicial de un destino es una excepción explícita y conserva zoom. */
    if (
      firstItineraryProjection
      && routeCities.length > 0
      && !pendingFirstDestinationFocusRef.current
    ) {
      viewportIdleListener = map.addListener?.('idle', () => {
        viewportIdleListener?.remove?.();
        viewportIdleListener = null;
        refreshRoutes();
      });
      if (routeCities.length === 1) {
        map.panTo({ lat: routeCities[0].lat, lng: routeCities[0].lon });
        map.setZoom(10);
      } else if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 84);
      } else {
        viewportIdleListener?.remove?.();
        viewportIdleListener = null;
        refreshRoutes();
      }
    } else {
      refreshRoutes();
    }

    return () => {
      viewportIdleListener?.remove?.();
      if (routeRefreshFrame) cancelAnimationFrame(routeRefreshFrame);
      /* No desmontar aquí trazos, landmarks ni marcadores: el siguiente efecto
         los reconcilia sobre los mismos nodos y evita un frame intermedio vacío. */
    };
  }, [placesActive, ready, segments, t]);

  useEffect(() => {
    const previousKey = firstDestinationKeyRef.current;
    firstDestinationKeyRef.current = firstDestinationKey;

    if (!previousKey && firstDestinationKey && firstDestination) {
      pendingFirstDestinationFocusRef.current = {
        lat: Number(firstDestination.lat),
        lng: Number(firstDestination.lon),
      };
    }

    const pendingFocus = pendingFirstDestinationFocusRef.current;
    const map = mapRef.current;
    if (!map || !ready || placesActive || !pendingFocus) return;
    if (!Number.isFinite(pendingFocus.lat) || !Number.isFinite(pendingFocus.lng)) {
      pendingFirstDestinationFocusRef.current = null;
      return;
    }

    map.panTo({ lat: pendingFocus.lat, lng: pendingFocus.lng });
    pendingFirstDestinationFocusRef.current = null;
  }, [firstDestination, firstDestinationKey, placesActive, ready]);

  useEffect(() => {
    if (!ready || !placesActive) return undefined;

    const dismissPlaceInfo = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.place-result-marker, .google-saved-place-marker, .gm-style-iw-c')) {
        return;
      }
      infoWindowRef.current?.close();
      if (!target.closest('.geo-search')) {
        dismissPlaceSearchResults();
      }
    };
    document.addEventListener('pointerdown', dismissPlaceInfo);
    return () => document.removeEventListener('pointerdown', dismissPlaceInfo);
  }, [dismissPlaceSearchResults, placesActive, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    clearAdvancedMarkers(savedPlaceMarkersRef);
    if (!map || !ready || !AdvancedMarkerElement || !placesActive) {
      return undefined;
    }

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
      content.addEventListener('click', (event) => {
        event.stopPropagation();
        infoWindowRef.current?.setContent(savedPlacePopup(place, t));
        infoWindowRef.current?.open({
          map,
          anchor: marker,
          shouldFocus: false,
        });
      });
      savedPlaceMarkersRef.current.push(marker);
    });

    return () => clearAdvancedMarkers(savedPlaceMarkersRef);
  }, [locatedPlaces, placesActive, ready, savedMarkerColors, t]);
  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    const maps = globalThis.google?.maps;
    clearAdvancedMarkers(resultPlaceMarkersRef);
    if (!map || !ready || !AdvancedMarkerElement || !maps || !placesActive) {
      return undefined;
    }

    const results = placeSearchResults.filter(isPlaced);
    const resultBounds = new maps.LatLngBounds();
    results.forEach((place) => {
      const alreadySaved = places.some((saved) => sameSavedPlace(saved, place));
      const content = markerElement(place, t, {
        alreadySaved,
        onSave: (selected) => {
          const savedPlace = placeForSaving(selected);
          if (!isPlaced(savedPlace)) return;
          addPlace?.(savedPlace);
          clearTimeout(saveNoticeTimerRef.current);
          setSaveNotice(t('placeSaved'));
          saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 2200);
        },
      });
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lon },
        title: placeLabel(place, t),
        content,
        zIndex: 20,
      });
      resultPlaceMarkersRef.current.push(marker);
      resultBounds.extend({ lat: place.lat, lng: place.lon });
    });

    if (results.length === 1) {
      map.panTo({ lat: results[0].lat, lng: results[0].lon });
      map.setZoom(14);
    } else if (results.length > 1 && !resultBounds.isEmpty()) {
      map.fitBounds(resultBounds, 84);
    }

    return () => clearAdvancedMarkers(resultPlaceMarkersRef);
  }, [
    addPlace,
    placeSearchResults,
    places,
    placesActive,
    ready,
    t,
  ]);

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
      {loadErrorKey && <div className="geo-map__missing">{t(loadErrorKey)}</div>}
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
