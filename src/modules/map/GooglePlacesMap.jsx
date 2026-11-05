import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconMinus, IconPlus, IconStack2 } from '@tabler/icons-react';
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
import { buildMapFeatureData, cityKey } from './routeMapModel.js';
import {
  middlePoint,
  numberedPlaceMarker,
  pendingLineLayer,
  routeDrawSegments,
  routeLineLayers,
  transitBadgeElement,
} from './myRoutesMapStyle.js';
import { placeColor, placeCountryColors, placeDayIndex } from '../places/placesDayModel.js';
import { useLiveRoutesVersion, withLiveGeometry } from '../routes/liveRouteStore.js';
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

const controlButtonStyle = (active = false) => ({
  display: 'inline-flex',
  height: 40,
  alignItems: 'center',
  gap: 8,
  padding: '0 14px 0 12px',
  border: 0,
  borderRadius: 10,
  background: active ? '#0b1f2c' : '#ffffff',
  color: active ? '#ffffff' : '#0b1f2c',
  font: '600 13px var(--font-body)',
  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)',
  cursor: 'pointer',
});
const zoomButtonStyle = {
  display: 'flex',
  width: 40,
  height: 40,
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 0,
  background: '#ffffff',
  color: '#3b4556',
  cursor: 'pointer',
};

function placeLabel(place, t) {
  return place.name || place.userLabel || t('place');
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
  planningSegments = [],
  focusDay = null,
  selectedPlaceId = '',
  onSelectPlace,
  focusLabel = '',
}) {
  const { t } = useTranslation();
  const liveRoutesVersion = useLiveRoutesVersion();
  const wrapRef = useRef(null);
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const savedPlaceMarkersRef = useRef([]);
  const resultPlaceMarkersRef = useRef([]);
  const savedRouteLinesRef = useRef([]);
  const transitLayerRef = useRef(null);
  const routeBadgeMarkersRef = useRef([]);
  const lastFocusedDayRef = useRef(undefined);
  const [layersControlNode, setLayersControlNode] = useState(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [transitLayerOn, setTransitLayerOn] = useState(false);
  const [showOtherDays, setShowOtherDays] = useState(true);
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

  // Mismo color por país y mismo número de parada que la lista de Mis rutas.
  const planningSegmentById = useMemo(
    () => new Map((planningSegments || []).map((segment) => [segment.id, segment])),
    [planningSegments]
  );
  const placeColors = useMemo(
    () => placeCountryColors(planningSegments, places),
    [planningSegments, places]
  );
  const dayIndex = useMemo(() => placeDayIndex(places, planningSegments), [places, planningSegments]);
  const focusedPlaceIds = useMemo(() => {
    if (focusDay == null || typeof focusDay !== 'number') return null;
    return new Set([...dayIndex].filter(([, info]) => info.tripDayOffset === focusDay).map(([id]) => id));
  }, [dayIndex, focusDay]);

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
      const inFocus = !focusedPlaceIds || focusedPlaceIds.has(place.id);
      if (!inFocus && !showOtherDays) return;
      const selected = inFocus && selectedPlaceId === place.id;
      const content = numberedPlaceMarker({
        number: dayIndex.get(place.id)?.number || 0,
        color: placeColor(place, planningSegmentById, placeColors),
        selected,
        muted: !inFocus,
        label: placeLabel(place, t),
      });
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lon },
        title: placeLabel(place, t),
        content,
        zIndex: selected ? 30 : inFocus ? 10 : 1,
      });
      content.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectPlace?.(place.id);
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
  }, [
    dayIndex,
    focusedPlaceIds,
    locatedPlaces,
    onSelectPlace,
    placeColors,
    placesActive,
    planningSegmentById,
    ready,
    selectedPlaceId,
    showOtherDays,
    t,
  ]);

  // Al abrir un día, el mapa encuadra sus lugares. Después, la cámara es del usuario.
  useEffect(() => {
    const map = mapRef.current;
    const maps = globalThis.google?.maps;
    if (!placesActive) {
      lastFocusedDayRef.current = undefined;
      return;
    }
    if (!map || !ready || !maps || typeof focusDay !== 'number') return;
    if (lastFocusedDayRef.current === focusDay) return;
    const targets = locatedPlaces.filter(
      (place) => isPlaced(place) && (!focusedPlaceIds || focusedPlaceIds.has(place.id))
    );
    if (!targets.length) return;
    lastFocusedDayRef.current = focusDay;
    if (targets.length === 1) {
      map.panTo({ lat: targets[0].lat, lng: targets[0].lon });
      if ((map.getZoom?.() || 0) < 14) map.setZoom(15);
      return;
    }
    const bounds = new maps.LatLngBounds();
    targets.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lon }));
    map.fitBounds(bounds, { top: 90, right: 70, bottom: 90, left: 60 });
  }, [focusDay, focusedPlaceIds, locatedPlaces, placesActive, ready]);

  // El lugar elegido en la lista queda a la vista.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !placesActive || !selectedPlaceId) return;
    const place = locatedPlaces.find((candidate) => candidate.id === selectedPlaceId);
    if (!isPlaced(place)) return;
    const position = { lat: place.lat, lng: place.lon };
    if (!map.getBounds?.()?.contains(position)) map.panTo(position);
  }, [locatedPlaces, placesActive, ready, selectedPlaceId]);

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
          const accepted = addPlace?.(savedPlace);
          if (accepted === false) return;
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
    const AdvancedMarkerElement = map?.__AdvancedMarkerElement;
    clearPolylines(savedRouteLinesRef);
    clearAdvancedMarkers(routeBadgeMarkersRef);
    if (!map || !ready || !maps || !placesActive) return undefined;

    const inFocus = (placeId) => !focusedPlaceIds || focusedPlaceIds.has(placeId);
    const drawn = new Set();
    routeConnections
      .filter((route) => route.visible !== false && inFocus(route.fromPlaceId) && inFocus(route.toPlaceId))
      .map(withLiveGeometry)
      .filter((route) => route?.geometry)
      .forEach((route) => {
        drawn.add(`${route.fromPlaceId}>${route.toPlaceId}`);
        routeDrawSegments(route, geometryPaths).forEach((segment) => {
          const path = toGooglePath(segment.coordinates);
          if (path.length < 2) return;
          routeLineLayers(maps, segment, path).forEach((options) => {
            savedRouteLinesRef.current.push(new maps.Polyline({ ...options, map }));
          });
          if (segment.kind === 'transit' && segment.label && AdvancedMarkerElement) {
            routeBadgeMarkersRef.current.push(new AdvancedMarkerElement({
              map,
              position: middlePoint(path),
              content: transitBadgeElement(segment.label, segment.color),
              zIndex: 25,
            }));
          }
        });
      });

    // Paradas consecutivas del día abierto sin modo elegido: recta tenue.
    if (focusedPlaceIds) {
      const ordered = [...dayIndex]
        .filter(([id]) => focusedPlaceIds.has(id))
        .sort((left, right) => left[1].number - right[1].number)
        .map(([id]) => locatedPlaces.find((place) => place.id === id))
        .filter(Boolean);
      for (let index = 1; index < ordered.length; index += 1) {
        const from = ordered[index - 1];
        const to = ordered[index];
        if (!isPlaced(from) || !isPlaced(to) || drawn.has(`${from.id}>${to.id}`)) continue;
        const path = [{ lat: from.lat, lng: from.lon }, { lat: to.lat, lng: to.lon }];
        savedRouteLinesRef.current.push(new maps.Polyline({ ...pendingLineLayer(maps, path), map }));
      }
    }

    return () => {
      clearPolylines(savedRouteLinesRef);
      clearAdvancedMarkers(routeBadgeMarkersRef);
    };
  }, [dayIndex, focusedPlaceIds, liveRoutesVersion, locatedPlaces, placesActive, ready, routeConnections]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = globalThis.google?.maps;
    if (!map || !ready || !maps?.ControlPosition) return undefined;
    // En Mis rutas el zoom vive junto a «Capas», con el mismo lenguaje visual.
    map.setOptions?.({ zoomControl: !placesActive });
    if (!placesActive) return undefined;
    const node = document.createElement('div');
    node.style.margin = '0 16px 24px 0';
    const controls = map.controls[maps.ControlPosition.RIGHT_BOTTOM];
    controls.push(node);
    setLayersControlNode(node);
    return () => {
      const index = controls.getArray().indexOf(node);
      if (index >= 0) controls.removeAt(index);
      setLayersControlNode(null);
    };
  }, [placesActive, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = globalThis.google?.maps;
    if (!map || !ready || !maps?.TransitLayer) return;
    if (!transitLayerRef.current) transitLayerRef.current = new maps.TransitLayer();
    transitLayerRef.current.setMap(transitLayerOn && placesActive ? map : null);
  }, [placesActive, ready, transitLayerOn]);

  useEffect(() => {
    if (!layersOpen) return undefined;
    const close = (event) => {
      if (!event.target?.closest?.('[data-map-layers]')) setLayersOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [layersOpen]);

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
      {placesActive && mapConfigured && (
        <div
          aria-label={t('mapLegend')}
          style={{ position: 'absolute', zIndex: 650, left: 16, bottom: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4, maxWidth: 'calc(100% - 260px)', minHeight: 40, padding: '6px 14px', boxSizing: 'border-box', borderRadius: 10, background: '#ffffff', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)', color: '#3b4556', fontFamily: 'var(--font-body)', fontSize: 12 }}
        >
          {focusLabel && <strong style={{ color: '#0b1f2c', fontWeight: 600 }}>{focusLabel}</strong>}
          {[
            { key: 'walk', label: t('routeModeWalk'), line: <path d="M2 3 H20" stroke="#475569" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 6" /> },
            { key: 'transit', label: t('routeModeTransit'), line: <path d="M2 3 H20" stroke="#23647a" strokeWidth="4" strokeLinecap="round" /> },
            { key: 'drive', label: t('routeModeDrive'), line: <path d="M2 3 H20" stroke="#0e4f63" strokeWidth="4" strokeLinecap="round" /> },
            { key: 'bicycle', label: t('routeModeBicycle'), line: <path d="M2 3 H20" stroke="#2a9d8f" strokeWidth="3.5" strokeDasharray="6 4" /> },
            { key: 'pending', label: t('legendNotChosen'), line: <path d="M2 3 H20" stroke="#9aa3af" strokeWidth="2" strokeDasharray="4 4" /> },
          ].map((item) => (
            <span key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <svg width="22" height="6" aria-hidden="true">{item.line}</svg>
              {item.label}
            </span>
          ))}
          {routeConnections.some((route) => route.visible !== false && withLiveGeometry(route)?.geometry) && (
            <span style={{ color: '#5f6368', fontSize: 10 }}>Powered by Google</span>
          )}
        </div>
      )}
      {saveNotice && (
        <div className="toast" role="status" aria-live="polite">{saveNotice}</div>
      )}
      {layersControlNode && createPortal(
        <div data-map-layers style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 8, fontFamily: 'var(--font-body)' }}>
          {layersOpen && (
            <div
              role="dialog"
              aria-label={t('mapLayers')}
              style={{ position: 'absolute', right: 48, bottom: 48, width: 244, padding: 6, borderRadius: 12, background: '#ffffff', boxShadow: '0 6px 24px rgba(0, 0, 0, 0.16)' }}
            >
              <div style={{ padding: '8px 10px 6px', color: '#667085', fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{t('mapLayers')}</div>
              {[
                { key: 'transit', label: t('mapLayerTransit'), hint: t('mapLayerTransitHint'), checked: transitLayerOn, toggle: () => setTransitLayerOn((value) => !value) },
                { key: 'others', label: t('mapLayerOtherDays'), hint: '', checked: showOtherDays, toggle: () => setShowOtherDays((value) => !value) },
              ].map((layer) => (
                <label
                  key={layer.key}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 36px', alignItems: 'center', gap: 10, minHeight: 46, padding: '0 10px', borderRadius: 8, color: '#0b1f2c', fontSize: 13, cursor: 'pointer' }}
                >
                  <span>
                    {layer.label}
                    {layer.hint && <span style={{ display: 'block', color: '#667085', fontSize: 11.5 }}>{layer.hint}</span>}
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={layer.checked}
                    onChange={layer.toggle}
                    style={{ width: 18, height: 18, margin: 0, justifySelf: 'end', accentColor: '#0b1f2c' }}
                  />
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-expanded={layersOpen}
            aria-haspopup="dialog"
            onClick={() => setLayersOpen((value) => !value)}
            style={controlButtonStyle(layersOpen)}
          >
            <IconStack2 size={17} stroke={1.8} aria-hidden="true" />
            {t('mapLayers')}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, background: '#ffffff', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)', overflow: 'hidden' }}>
            <button type="button" aria-label={t('zoomIn')} title={t('zoomIn')} style={zoomButtonStyle} onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() || 0) + 1)}>
              <IconPlus size={17} aria-hidden="true" />
            </button>
            <span aria-hidden="true" style={{ height: 1, margin: '0 8px', background: '#eef0f2' }} />
            <button type="button" aria-label={t('zoomOut')} title={t('zoomOut')} style={zoomButtonStyle} onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() || 0) - 1)}>
              <IconMinus size={17} aria-hidden="true" />
            </button>
          </div>
        </div>,
        layersControlNode
      )}
    </div>
  );
}
