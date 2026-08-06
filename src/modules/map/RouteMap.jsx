import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config, colorForIndex } from '../../config.js';
import { isPlaced } from '../trips/tripModel.js';
import { fetchGeoapifyPlaceImage, searchGeoapifyPlaces } from '../places/geoapifyClient.js';
import { countryFillStyleState } from './countryColoring.js';
import { resolveOvertureDivisionsPmtilesUrl } from './overtureCountrySource.js';
import { installSavedPlaceSymbolLayer } from './savedPlaceSymbol.js';
import './RouteMap.css';

const COUNTRY_BOUNDARY_SOURCE_ID = 'atlas-country-boundaries';
const COUNTRY_FILL_LAYER_ID = 'atlas-country-fill';
const COUNTRY_BOUNDARY_SOURCE_LAYER = 'division_area';
const PMTILES_PROTOCOL_STATE = '__atlasPmtilesProtocolStateV1';
const ROUTE_SOURCE_ID = 'atlas-routes';
const ROUTE_CASING_LAYER_ID = 'atlas-routes-casing';
const ROUTE_SOLID_LAYER_ID = 'atlas-routes-solid';
const ROUTE_DASHED_LAYER_ID = 'atlas-routes-dashed';
const CITY_SOURCE_ID = 'atlas-cities';
const CITY_LAYER_ID = 'atlas-cities-layer';
const PLACE_SOURCE_ID = 'atlas-saved-places';
const PLACE_LAYER_ID = 'atlas-saved-places-layer';

function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function sourceData(map, id, data) {
  const source = map.getSource(id);
  if (source && typeof source.setData === 'function') source.setData(data);
}

function dominantTransport(segment) {
  const transport = segment?.expenses?.transport || {};
  const candidates = [
    { type: 'plane', amount: Number(transport.plane) || 0 },
    { type: 'train', amount: Number(transport.train) || 0 },
    { type: 'bus', amount: Number(transport.bus) || 0 },
    { type: 'car', amount: Number(transport.taxiUber) || 0 },
  ];
  const top = candidates.reduce((current, candidate) =>
    candidate.amount > current.amount ? candidate : current
  );
  return top.amount > 0 ? top.type : null;
}

function adaptiveCurve(origin, destination, steps = 80) {
  const start = [origin.lon, origin.lat];
  const end = [destination.lon, destination.lat];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 1.25 || distance > 24) return [start, end];

  const factor = Math.max(0.06, Math.min(0.2, 0.19 - Math.max(0, distance - 2) * 0.008));
  const offset = Math.min(distance * factor, 3.25);
  const middleX = (start[0] + end[0]) / 2;
  const middleY = (start[1] + end[1]) / 2;
  const length = distance || 1;
  const controlX = middleX + (dy / length) * offset;
  const controlY = middleY + (-dx / length) * offset;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const time = index / steps;
    const remaining = 1 - time;
    points.push([
      remaining * remaining * start[0] + 2 * remaining * time * controlX + time * time * end[0],
      remaining * remaining * start[1] + 2 * remaining * time * controlY + time * time * end[1],
    ]);
  }

  return points;
}

function cityKey(city) {
  return `${Number(city.lat).toFixed(6)},${Number(city.lon).toFixed(6)}`;
}

function orderedCities(segments) {
  const cities = [];
  const seen = new Set();
  (segments || []).forEach((segment) =>
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const key = cityKey(city);
      if (seen.has(key)) return;
      seen.add(key);
      cities.push(city);
    })
  );
  return cities;
}

export function placeSearchContext(segments) {
  const cities = orderedCities(segments);
  const anchor =
    [...(segments || [])]
      .reverse()
      .flatMap((segment) => [segment.destination, segment.origin])
      .find(isPlaced) || cities.at(-1);

  if (!anchor) return { knownLocations: [] };
  return {
    city: anchor.name || anchor.displayName || '',
    country: anchor.country || '',
    countryCode: anchor.countryCode || '',
    lat: anchor.lat,
    lon: anchor.lon,
    knownLocations: cities
      .flatMap((city) => [city.name, city.displayName, city.country])
      .filter(Boolean),
  };
}

function escaped(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function geoapifyStyleUrl() {
  return `https://maps.geoapify.com/v1/styles/${encodeURIComponent(
    config.geoapify.mapStyle
  )}/style.json?apiKey=${encodeURIComponent(config.geoapify.mapApiKey)}`;
}

function setPaintIfPresent(map, id, property, value) {
  if (map.getLayer(id)) map.setPaintProperty(id, property, value);
}

function setVisibilityIfPresent(map, id, visibility) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
}

function applyBaseStyleOverrides(map) {
  setPaintIfPresent(map, 'background', 'background-color', '#f4f4f4');
  setPaintIfPresent(map, 'park', 'fill-color', '#e3e7e1');
  setVisibilityIfPresent(map, 'park', 'none');
  setPaintIfPresent(map, 'water', 'fill-color', '#d6d6d6');
  setPaintIfPresent(map, 'landuse_residential', 'fill-color', '#ebebeb');
  setPaintIfPresent(map, 'waterway', 'line-color', '#89b5c3');
  setVisibilityIfPresent(map, 'waterway', 'none');
  setPaintIfPresent(map, 'highway_motorway_subtle', 'line-color', 'rgba(232,232,232,0.53)');
  setPaintIfPresent(map, 'boundary_state', 'line-color', '#b6b6b6');
  setVisibilityIfPresent(map, 'boundary_country', 'none');
}

function ensurePmtilesProtocol(url) {
  let state = globalThis[PMTILES_PROTOCOL_STATE];
  if (!state) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    state = { protocol, archiveUrls: new Set() };
    globalThis[PMTILES_PROTOCOL_STATE] = state;
  }
  if (!state.archiveUrls.has(url)) {
    state.protocol.add(new PMTiles(url));
    state.archiveUrls.add(url);
  }
}

function firstSymbolLayerId(map) {
  return map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id;
}

function addCountryBoundaryLayer(map, url) {
  if (!url || map.getSource(COUNTRY_BOUNDARY_SOURCE_ID)) return;
  ensurePmtilesProtocol(url);
  map.addSource(COUNTRY_BOUNDARY_SOURCE_ID, {
    type: 'vector',
    url: `pmtiles://${url}`,
    attribution: '© Overture Maps Foundation · © OpenStreetMap contributors',
  });
  map.addLayer(
    {
      id: COUNTRY_FILL_LAYER_ID,
      type: 'fill',
      source: COUNTRY_BOUNDARY_SOURCE_ID,
      'source-layer': COUNTRY_BOUNDARY_SOURCE_LAYER,
      filter: [
        'all',
        ['==', ['get', 'subtype'], 'country'],
        ['==', ['get', 'class'], 'land'],
        ['==', ['get', 'country'], '__NO_VISITED_COUNTRIES__'],
      ],
      paint: {
        'fill-color': 'transparent',
        'fill-opacity': 0.13,
        'fill-antialias': false,
      },
    },
    firstSymbolLayerId(map)
  );
}

function addBaseSourcesAndLayers(map) {
  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: ROUTE_CASING_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fff', 'line-width': 5, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: ROUTE_SOLID_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'dashed'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.95 },
  });
  map.addLayer({
    id: ROUTE_DASHED_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'dashed'], true],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2,
      'line-opacity': 0.95,
      'line-dasharray': [5, 4],
    },
  });
  map.addSource(CITY_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: CITY_LAYER_ID,
    type: 'circle',
    source: CITY_SOURCE_ID,
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', 'color'],
      'circle-opacity': 1,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });
  map.addSource(PLACE_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: PLACE_LAYER_ID,
    type: 'circle',
    source: PLACE_SOURCE_ID,
    paint: {
      'circle-radius': 7,
      'circle-color': '#2563eb',
      'circle-opacity': 0.95,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });
}

function normalizedCountryCode(value) {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : '';
}

function savedPlacePopup(place) {
  const wrap = document.createElement('div');
  wrap.className = 'place-popup';
  const code = normalizedCountryCode(place.countryCode);
  const country = place.country || place.countryCode || '';
  const flag = code
    ? `<img class="place-popup__flag" src="https://flagcdn.com/24x18/${code}.png" width="24" height="18" alt="Bandera de ${escaped(
        country
      )}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  wrap.innerHTML = `<div class="place-popup__heading">${flag}<strong>${escaped(
    place.name || 'Lugar'
  )}</strong></div><span>${escaped(place.city || '')}${
    place.city && country ? ', ' : ''
  }${escaped(country)}</span><small>${escaped(place.category || 'Lugar')}</small>`;
  const flagImage = wrap.querySelector('.place-popup__flag');
  flagImage?.addEventListener('error', () => flagImage.remove(), { once: true });
  return wrap;
}

function savePrompt(place, { alreadySaved = false, onSave, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'place-save-prompt';
  const text = document.createElement('span');
  text.textContent = alreadySaved ? 'Este lugar ya está guardado.' : '¿Guardar lugar para tu ruta?';
  wrap.append(text);

  if (!alreadySaved) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Guardar';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSave?.(place);
      onClose?.();
    });
    wrap.append(button);
  }
  return wrap;
}

export function representativePlaceIcon(place) {
  const text = `${place?.category || ''} ${place?.name || ''}`.toLowerCase();
  if (/museum|museo|gallery|galer/.test(text)) return '🏛️';
  if (/restaurant|restaurante|food|cafe|coffee|bar|comida/.test(text)) return '🍽️';
  if (/hotel|hostel|lodging|hosped/.test(text)) return '🛏️';
  if (/station|estaci|train|metro|airport|aeropuerto/.test(text)) return '🚉';
  if (/park|parque|garden|jard/.test(text)) return '🌳';
  if (/church|iglesia|temple|templo|cathedral|catedral/.test(text)) return '⛪';
  if (/shop|store|tienda|market|mercado/.test(text)) return '🛍️';
  return '📍';
}

function resultMarkerScale(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.52, Math.min(1, 0.52 + ((value - 5) * 0.48) / 7));
}

function markerElement(place) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'place-result-marker';
  button.setAttribute(
    'aria-label',
    `${place.name || 'Lugar'}, ${place.city || ''}, ${place.country || ''}`
  );

  const media = document.createElement('span');
  media.className = 'place-result-marker__media';
  const fallback = document.createElement('span');
  fallback.className = 'place-result-marker__fallback';
  fallback.textContent = representativePlaceIcon(place);
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('load', () => image.classList.add('is-loaded'));
  image.addEventListener('error', () => {
    image.classList.remove('is-loaded');
    image.removeAttribute('src');
  });
  media.append(fallback, image);

  const copy = document.createElement('span');
  copy.className = 'place-result-marker__copy';
  const name = document.createElement('strong');
  name.textContent = place.name || 'Lugar';
  const location = document.createElement('small');
  location.textContent = [place.city, place.country || place.countryCode].filter(Boolean).join(', ');
  copy.append(name, location);
  button.append(media, copy);
  return { button, image };
}

export function RouteMap({ segments, places = [], addPlace, viewMode = 'segments' }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const searchAbortRef = useRef(null);
  const autocompleteAbortRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const autocompleteSequenceRef = useRef(0);
  const resultMarkersRef = useRef([]);
  const addPlaceRef = useRef(addPlace);
  const placesRef = useRef(places);
  const activePromptRef = useRef(null);
  const skipAutocompleteRef = useRef(false);
  const lastRouteViewportKeyRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  const [countryLayerReady, setCountryLayerReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  const searchContext = useMemo(() => placeSearchContext(segments), [segments]);

  useEffect(() => {
    addPlaceRef.current = addPlace;
  }, [addPlace]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(
    () => () => {
      clearTimeout(saveNoticeTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !config.geoapify.mapApiKey) return undefined;
    let disposed = false;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: geoapifyStyleUrl(),
      center: [config.map.initialCenter[1], config.map.initialCenter[0]],
      zoom: config.map.initialZoom,
      attributionControl: true,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      'bottom-right'
    );

    const cityPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    const setPointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = '';
    };
    const showCityPopup = (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== 'Point') return;
      setPointer();
      cityPopup
        .setLngLat(feature.geometry.coordinates)
        .setText(feature.properties?.name || 'Ciudad')
        .addTo(map);
    };
    const clearHover = () => {
      clearPointer();
      cityPopup.remove();
    };
    const showSavedPlace = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      new maplibregl.Popup({ offset: 10 })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(savedPlacePopup(feature.properties))
        .addTo(map);
    };

    map.on('load', () => {
      applyBaseStyleOverrides(map);
      addBaseSourcesAndLayers(map);
      installSavedPlaceSymbolLayer(map);
      map.on('mouseenter', CITY_LAYER_ID, showCityPopup);
      map.on('mouseleave', CITY_LAYER_ID, clearHover);
      map.on('mouseenter', PLACE_LAYER_ID, setPointer);
      map.on('mouseleave', PLACE_LAYER_ID, clearPointer);
      map.on('click', PLACE_LAYER_ID, showSavedPlace);
      setMapReady(true);
      resolveOvertureDivisionsPmtilesUrl(config.map.countryBoundariesUrl)
        .then((url) => {
          if (disposed || !mapRef.current) return;
          addCountryBoundaryLayer(map, url);
          setCountryLayerReady(true);
        })
        .catch((countryError) =>
          console.warn('[Country coloring] Overture PMTiles unavailable', countryError)
        );
    });

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapNode.current);

    return () => {
      disposed = true;
      observer.disconnect();
      searchAbortRef.current?.abort();
      autocompleteAbortRef.current?.abort();
      activePromptRef.current?.remove();
      resultMarkersRef.current.forEach(({ marker, controller }) => {
        controller.abort();
        marker.remove();
      });
      resultMarkersRef.current = [];
      cityPopup.remove();
      setCountryLayerReady(false);
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const syncResultMarkerScale = () => {
      const scale = String(resultMarkerScale(map.getZoom()));
      resultMarkersRef.current.forEach(({ button }) => {
        button?.style.setProperty('--place-marker-scale', scale);
      });
    };

    syncResultMarkerScale();
    map.on('zoom', syncResultMarkerScale);
    return () => map.off('zoom', syncResultMarkerScale);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !countryLayerReady || !map.getLayer(COUNTRY_FILL_LAYER_ID)) return;
    const visibleSegments = viewMode === 'segments' ? segments : [];
    const { filter, colorExpression } = countryFillStyleState(visibleSegments, colorForIndex);
    map.setFilter(COUNTRY_FILL_LAYER_ID, filter);
    map.setPaintProperty(COUNTRY_FILL_LAYER_ID, 'fill-color', colorExpression);
  }, [segments, viewMode, mapReady, countryLayerReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const showSegments = viewMode === 'segments';
    const showPlaces = viewMode === 'places';
    const routeFeatures = [];
    const cityFeatures = [];
    const placeFeatures = [];
    const routeCities = showSegments ? orderedCities(segments) : [];
    const routeBounds = new maplibregl.LngLatBounds();

    if (showSegments) {
      segments.forEach((segment, index) => {
        if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
        routeFeatures.push({
          type: 'Feature',
          properties: {
            color: colorForIndex(index),
            dashed: dominantTransport(segment) === 'plane',
          },
          geometry: {
            type: 'LineString',
            coordinates: adaptiveCurve(segment.origin, segment.destination),
          },
        });
      });
    }

    routeCities.forEach((city, index) => {
      cityFeatures.push({
        type: 'Feature',
        properties: {
          name: city.name || city.displayName || 'Ciudad',
          color: colorForIndex(index),
        },
        geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
      });
      routeBounds.extend([city.lon, city.lat]);
    });

    if (showPlaces) {
      places.filter(isPlaced).forEach((place) => {
        placeFeatures.push({
          type: 'Feature',
          properties: {
            id: place.id,
            name: place.name || 'Lugar',
            city: place.city || '',
            country: place.country || '',
            countryCode: place.countryCode || '',
            category: place.category || '',
            address: place.address || '',
          },
          geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
        });
      });
    }

    sourceData(map, ROUTE_SOURCE_ID, { type: 'FeatureCollection', features: routeFeatures });
    sourceData(map, CITY_SOURCE_ID, { type: 'FeatureCollection', features: cityFeatures });
    sourceData(map, PLACE_SOURCE_ID, { type: 'FeatureCollection', features: placeFeatures });

    const routeViewportKey = showSegments
      ? routeCities.map(cityKey).join('|')
      : `view:${viewMode}`;
    if (routeViewportKey !== lastRouteViewportKeyRef.current) {
      lastRouteViewportKeyRef.current = routeViewportKey;
      if (showSegments && routeCities.length === 1) {
        map.easeTo({ center: routeBounds.getCenter(), zoom: 10, duration: 0 });
      } else if (showSegments && routeCities.length > 1) {
        map.fitBounds(routeBounds, { padding: 84, maxZoom: 10, duration: 0 });
      }
    }
  }, [segments, places, viewMode, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || viewMode !== 'places') return undefined;

    activePromptRef.current?.remove();
    activePromptRef.current = null;
    resultMarkersRef.current.forEach(({ marker, controller }) => {
      controller.abort();
      marker.remove();
    });
    resultMarkersRef.current = [];

    const validResults = results.filter(isPlaced);
    const bounds = new maplibregl.LngLatBounds();

    function openPlace(place) {
      activePromptRef.current?.remove();
      map.easeTo({
        center: [place.lon, place.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 350,
      });
      const alreadySaved = placesRef.current.some(
        (saved) => String(saved.id) === String(place.id)
      );
      let popup;
      popup = new maplibregl.Popup({
        anchor: 'bottom',
        offset: [0, -58],
        closeOnClick: false,
        closeButton: true,
        focusAfterOpen: false,
        className: 'place-save-popup',
      })
        .setMaxWidth('320px')
        .setLngLat([place.lon, place.lat])
        .setDOMContent(
          savePrompt(place, {
            alreadySaved,
            onSave: (selected) => {
              const savedPlace = {
                id: selected.id,
                name: selected.name || 'Lugar',
                address: selected.address || selected.formatted || '',
                city: selected.city || '',
                country: selected.country || '',
                countryCode: selected.countryCode || '',
                category: selected.category || '',
                lat: Number(selected.lat),
                lon: Number(selected.lon),
                savedAt: new Date().toISOString(),
              };
              if (isPlaced(savedPlace)) {
                addPlaceRef.current?.(savedPlace);
                clearTimeout(saveNoticeTimerRef.current);
                setSaveNotice('Lugar guardado');
                saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 2200);
              }
            },
            onClose: () => popup.remove(),
          })
        )
        .addTo(map);
      popup.on('close', () => {
        if (activePromptRef.current === popup) activePromptRef.current = null;
      });
      activePromptRef.current = popup;
    }

    validResults.forEach((place) => {
      const { button, image } = markerElement(place);
      button.style.setProperty('--place-marker-scale', String(resultMarkerScale(map.getZoom())));
      const controller = new AbortController();
      const marker = new maplibregl.Marker({ element: button, anchor: 'bottom' })
        .setLngLat([place.lon, place.lat])
        .addTo(map);

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPlace(place);
      });

      fetchGeoapifyPlaceImage(place, { signal: controller.signal })
        .then((url) => {
          if (!url || controller.signal.aborted) return;
          image.src = url;
        })
        .catch((imageError) => {
          if (imageError?.name !== 'AbortError') {
            console.warn('[Place image] unavailable', imageError);
          }
        });

      resultMarkersRef.current.push({ marker, controller, button });
      bounds.extend([place.lon, place.lat]);
    });

    if (validResults.length === 1) {
      map.easeTo({ center: [validResults[0].lon, validResults[0].lat], zoom: 14, duration: 350 });
    } else if (validResults.length > 1) {
      map.fitBounds(bounds, { padding: 140, maxZoom: 14, duration: 350 });
    }

    return () => {
      activePromptRef.current?.remove();
      activePromptRef.current = null;
      resultMarkersRef.current.forEach(({ marker, controller }) => {
        controller.abort();
        marker.remove();
      });
      resultMarkersRef.current = [];
    };
  }, [results, viewMode, mapReady]);

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
          context: searchContext,
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
  }, [query, searchContext, viewMode]);

  async function submitSearch(event) {
    event?.preventDefault();
    const text = query.trim();
    if (text.length < config.geoapify.searchMinChars) {
      setError(`Escribe al menos ${config.geoapify.searchMinChars} caracteres.`);
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
    setError('');

    try {
      const next = await searchGeoapifyPlaces(text, {
        signal: controller.signal,
        context: searchContext,
      });
      if (!controller.signal.aborted && sequence === searchSequenceRef.current) {
        setResults(next);
      }
    } catch (searchError) {
      if (searchError?.name !== 'AbortError' && sequence === searchSequenceRef.current) {
        setError(searchError.message || 'No fue posible buscar lugares.');
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
    setError('');
    setResults([place]);
  }

  function clearSearch() {
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    searchSequenceRef.current += 1;
    activePromptRef.current?.remove();
    activePromptRef.current = null;
    skipAutocompleteRef.current = false;
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggesting(false);
    setSearching(false);
    setError('');
  }

  function handleQueryChange(event) {
    const next = event.target.value;
    autocompleteAbortRef.current?.abort();
    autocompleteSequenceRef.current += 1;
    setSuggesting(false);
    setQuery(next);
    setError('');
    if (next.trim().length < config.geoapify.searchMinChars) {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  const canClearSearch = Boolean(query || results.length > 0 || suggestions.length > 0 || error);

  return (
    <div className="geo-map-wrap">
      <div className="geo-map" ref={mapNode}>
        {!config.geoapify.mapApiKey && (
          <div className="geo-map__missing">Falta VITE_GEOAPIFY_MAPS_API_KEY.</div>
        )}
      </div>
      {viewMode === 'places' && (
        <form className="geo-search" onSubmit={submitSearch}>
          <div className="geo-search__row">
            <div className="geo-search__input-wrap">
              <input
                value={query}
                onChange={handleQueryChange}
                onFocus={() => suggestions.length && setShowSuggestions(true)}
                placeholder="Buscar hotel, restaurante, estación…"
                aria-label="Buscar lugares"
                autoComplete="off"
              />
              {canClearSearch && (
                <button
                  type="button"
                  className="geo-search__clear"
                  aria-label="Cerrar búsqueda y quitar resultados"
                  onClick={clearSearch}
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
            <button type="submit" className="geo-search__button" disabled={searching}>
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="geo-search__suggestions" role="listbox" aria-label="Sugerencias de lugares">
              {suggestions.map((place) => (
                <button
                  type="button"
                  className="geo-search__suggestion"
                  key={place.id}
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(place)}
                >
                  <strong>{place.name}</strong>
                  <small>{[place.city, place.country].filter(Boolean).join(', ')}</small>
                </button>
              ))}
            </div>
          )}
          {suggesting &&
            query.trim().length >= config.geoapify.searchMinChars &&
            !searching && <div className="geo-search__status">Buscando sugerencias…</div>}
          {error && <div className="geo-search__error">{error}</div>}
        </form>
      )}
      {viewMode === 'places' && saveNotice && (
        <div className="toast" role="status" aria-live="polite">
          {saveNotice}
        </div>
      )}
    </div>
  );
}
