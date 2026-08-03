import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config, colorForIndex } from '../../config.js';
import { isPlaced } from '../trips/tripModel.js';
import {
  fetchGeoapifyPlaceImage,
  searchGeoapifyPlaces,
} from '../places/geoapifyClient.js';
import { countryFillStyleState } from './countryColoring.js';
import { resolveOvertureDivisionsPmtilesUrl } from './overtureCountrySource.js';
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

function sourceData(map, sourceId, data) {
  const source = map.getSource(sourceId);
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
  const top = candidates.reduce((current, candidate) => (
    candidate.amount > current.amount ? candidate : current
  ));
  return top.amount > 0 ? top.type : null;
}

function adaptiveCurve(origin, destination, steps = 80) {
  const start = [origin.lon, origin.lat];
  const end = [destination.lon, destination.lat];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 1.25 || distance > 24) return [start, end];

  const curveFactor = Math.max(0.06, Math.min(0.20, 0.19 - Math.max(0, distance - 2) * 0.008));
  const offset = Math.min(distance * curveFactor, 3.25);
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
  (segments || []).forEach((segment) => {
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const key = cityKey(city);
      if (seen.has(key)) return;
      seen.add(key);
      cities.push(city);
    });
  });
  return cities;
}

export function placeSearchContext(segments) {
  const cities = orderedCities(segments);
  const anchor = [...(segments || [])]
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
    knownLocations: cities.flatMap((city) => [city.name, city.displayName, city.country]).filter(Boolean),
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
  const style = encodeURIComponent(config.geoapify.mapStyle);
  const apiKey = encodeURIComponent(config.geoapify.mapApiKey);
  return `https://maps.geoapify.com/v1/styles/${style}/style.json?apiKey=${apiKey}`;
}

function setPaintIfPresent(map, layerId, property, value) {
  if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
}

function setVisibilityIfPresent(map, layerId, visibility) {
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
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

function ensurePmtilesProtocol(archiveUrl) {
  let state = globalThis[PMTILES_PROTOCOL_STATE];
  if (!state) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    state = { protocol, archiveUrls: new Set() };
    globalThis[PMTILES_PROTOCOL_STATE] = state;
  }
  if (!state.archiveUrls.has(archiveUrl)) {
    state.protocol.add(new PMTiles(archiveUrl));
    state.archiveUrls.add(archiveUrl);
  }
}

function firstSymbolLayerId(map) {
  return map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id;
}

function addCountryBoundaryLayer(map, archiveUrl) {
  if (!archiveUrl || map.getSource(COUNTRY_BOUNDARY_SOURCE_ID)) return;
  ensurePmtilesProtocol(archiveUrl);
  map.addSource(COUNTRY_BOUNDARY_SOURCE_ID, {
    type: 'vector',
    url: `pmtiles://${archiveUrl}`,
    attribution: '© Overture Maps Foundation · © OpenStreetMap contributors',
  });
  map.addLayer({
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
  }, firstSymbolLayerId(map));
}

function addBaseSourcesAndLayers(map) {
  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: ROUTE_CASING_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.9 },
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
      'circle-stroke-color': '#ffffff',
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
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}

function popupContent(place, { allowSave = false, onSave } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'place-popup';
  wrap.innerHTML = `<strong>${escaped(place.name || 'Lugar')}</strong><span>${escaped(place.city || '')}${place.city && place.country ? ', ' : ''}${escaped(place.country || place.countryCode || '')}</span><small>${escaped(place.category || 'Lugar')}</small>`;
  if (allowSave) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Guardar en mi ruta';
    button.addEventListener('click', () => onSave?.(place));
    wrap.append(button);
  }
  return wrap;
}

function markerElement(place) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'place-result-marker';
  button.setAttribute('aria-label', `${place.name || 'Lugar'}, ${place.city || ''}, ${place.country || ''}`);

  const media = document.createElement('span');
  media.className = 'place-result-marker__media';
  const fallback = document.createElement('span');
  fallback.className = 'place-result-marker__fallback';
  fallback.textContent = String(place.name || 'L').trim().charAt(0).toUpperCase();
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
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

export function RouteMap({ segments, places = [], addPlace }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const abortRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const resultMarkersRef = useRef([]);
  const addPlaceRef = useRef(addPlace);
  const [mapReady, setMapReady] = useState(false);
  const [countryLayerReady, setCountryLayerReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const searchContext = useMemo(() => placeSearchContext(segments), [segments]);

  useEffect(() => { addPlaceRef.current = addPlace; }, [addPlace]);

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
    const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const clearPointer = () => { map.getCanvas().style.cursor = ''; };
    const showCityPopup = (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== 'Point') return;
      setPointer();
      cityPopup.setLngLat(feature.geometry.coordinates).setText(feature.properties?.name || 'Ciudad').addTo(map);
    };
    const clearHover = () => { clearPointer(); cityPopup.remove(); };
    const showSavedPlace = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      new maplibregl.Popup({ offset: 10 })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(popupContent(feature.properties))
        .addTo(map);
    };

    map.on('load', () => {
      applyBaseStyleOverrides(map);
      addBaseSourcesAndLayers(map);
      map.on('mouseenter', CITY_LAYER_ID, showCityPopup);
      map.on('mouseleave', CITY_LAYER_ID, clearHover);
      map.on('mouseenter', PLACE_LAYER_ID, setPointer);
      map.on('mouseleave', PLACE_LAYER_ID, clearPointer);
      map.on('click', PLACE_LAYER_ID, showSavedPlace);
      setMapReady(true);

      resolveOvertureDivisionsPmtilesUrl(config.map.countryBoundariesUrl)
        .then((archiveUrl) => {
          if (disposed || !mapRef.current) return;
          addCountryBoundaryLayer(map, archiveUrl);
          setCountryLayerReady(true);
        })
        .catch((countryError) => {
          console.warn('[Country coloring] Overture PMTiles unavailable', countryError);
        });
    });

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapNode.current);

    return () => {
      disposed = true;
      observer.disconnect();
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
    if (!map || !mapReady || !countryLayerReady || !map.getLayer(COUNTRY_FILL_LAYER_ID)) return;
    const { filter, colorExpression } = countryFillStyleState(segments, colorForIndex);
    map.setFilter(COUNTRY_FILL_LAYER_ID, filter);
    map.setPaintProperty(COUNTRY_FILL_LAYER_ID, 'fill-color', colorExpression);
  }, [segments, mapReady, countryLayerReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const routeFeatures = [];
    const cityFeatures = [];
    const placeFeatures = [];
    const bounds = new maplibregl.LngLatBounds();
    let boundsCount = 0;

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

    orderedCities(segments).forEach((city, index) => {
      cityFeatures.push({
        type: 'Feature',
        properties: {
          name: city.name || city.displayName || 'Ciudad',
          color: colorForIndex(index),
        },
        geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
      });
      bounds.extend([city.lon, city.lat]);
      boundsCount += 1;
    });

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
      bounds.extend([place.lon, place.lat]);
      boundsCount += 1;
    });

    sourceData(map, ROUTE_SOURCE_ID, { type: 'FeatureCollection', features: routeFeatures });
    sourceData(map, CITY_SOURCE_ID, { type: 'FeatureCollection', features: cityFeatures });
    sourceData(map, PLACE_SOURCE_ID, { type: 'FeatureCollection', features: placeFeatures });

    if (boundsCount === 1) {
      map.easeTo({ center: bounds.getCenter(), zoom: 10, duration: 0 });
    } else if (boundsCount > 1) {
      map.fitBounds(bounds, { padding: 84, maxZoom: 10, duration: 0 });
    }
  }, [segments, places, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    resultMarkersRef.current.forEach(({ marker, controller }) => {
      controller.abort();
      marker.remove();
    });
    resultMarkersRef.current = [];

    const validResults = results.filter(isPlaced);
    const bounds = new maplibregl.LngLatBounds();

    validResults.forEach((place) => {
      const { button, image } = markerElement(place);
      const controller = new AbortController();
      const marker = new maplibregl.Marker({ element: button, anchor: 'bottom' })
        .setLngLat([place.lon, place.lat])
        .addTo(map);

      button.addEventListener('click', () => {
        const popup = new maplibregl.Popup({ offset: [0, -10] })
          .setLngLat([place.lon, place.lat])
          .setDOMContent(popupContent(place, {
            allowSave: true,
            onSave: (selected) => {
              addPlaceRef.current?.({
                ...selected,
                address: selected.address || selected.formatted || '',
                savedAt: new Date().toISOString(),
              });
              popup.remove();
            },
          }))
          .addTo(map);
      });

      fetchGeoapifyPlaceImage(place, { signal: controller.signal })
        .then((url) => {
          if (!url || controller.signal.aborted) return;
          image.src = url;
          image.classList.add('is-loaded');
        })
        .catch((imageError) => {
          if (imageError?.name !== 'AbortError') {
            console.warn('[Place image] unavailable', imageError);
          }
        });

      resultMarkersRef.current.push({ marker, controller });
      bounds.extend([place.lon, place.lat]);
    });

    if (validResults.length === 1) {
      map.easeTo({ center: [validResults[0].lon, validResults[0].lat], zoom: 14, duration: 350 });
    } else if (validResults.length > 1) {
      map.fitBounds(bounds, { padding: 140, maxZoom: 14, duration: 350 });
    }

    return () => {
      resultMarkersRef.current.forEach(({ marker, controller }) => {
        controller.abort();
        marker.remove();
      });
      resultMarkersRef.current = [];
    };
  }, [results, mapReady]);

  useEffect(() => {
    abortRef.current?.abort();
    const text = query.trim();
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;

    if (text.length < config.geoapify.searchMinChars) {
      setResults([]);
      setSearching(false);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const nextResults = await searchGeoapifyPlaces(text, {
          signal: controller.signal,
          context: searchContext,
        });
        if (!controller.signal.aborted && sequence === searchSequenceRef.current) {
          setResults(nextResults);
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
    }, config.geoapify.searchDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchContext]);

  return (
    <div className="geo-map-wrap">
      <div className="geo-map" ref={mapNode}>
        {!config.geoapify.mapApiKey && (
          <div className="geo-map__missing">Falta VITE_GEOAPIFY_MAPS_API_KEY.</div>
        )}
      </div>
      <div className="geo-search">
        <div className="geo-search__row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar hotel, restaurante, estación…"
            aria-label="Buscar lugares"
          />
        </div>
        {searching && <div className="geo-search__status">Buscando…</div>}
        {error && <div className="geo-search__error">{error}</div>}
      </div>
    </div>
  );
}
