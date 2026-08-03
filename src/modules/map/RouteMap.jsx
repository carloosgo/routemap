import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config, colorForIndex } from '../../config.js';
import { isPlaced } from '../trips/tripModel.js';
import {
  getCountryLandBoundary,
  searchGeoapifyPlaces,
} from '../places/geoapifyClient.js';
import { getStaticCountryBoundary } from './countryBoundaryClient.js';
import { visitedCountries } from './countryColoring.js';
import './RouteMap.css';

const ROUTE_SOURCE_ID = 'atlas-routes';
const ROUTE_CASING_LAYER_ID = 'atlas-routes-casing';
const ROUTE_SOLID_LAYER_ID = 'atlas-routes-solid';
const ROUTE_DASHED_LAYER_ID = 'atlas-routes-dashed';
const CITY_SOURCE_ID = 'atlas-cities';
const CITY_LAYER_ID = 'atlas-cities-layer';
const PLACE_SOURCE_ID = 'atlas-saved-places';
const PLACE_LAYER_ID = 'atlas-saved-places-layer';
const RESULT_SOURCE_ID = 'atlas-search-results';
const RESULT_LAYER_ID = 'atlas-search-results-layer';

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
    const lon = remaining * remaining * start[0]
      + 2 * remaining * time * controlX
      + time * time * end[0];
    const lat = remaining * remaining * start[1]
      + 2 * remaining * time * controlY
      + time * time * end[1];
    points.push([lon, lat]);
  }

  return points;
}

function cityKey(city) {
  return `${Number(city.lat).toFixed(6)},${Number(city.lon).toFixed(6)}`;
}

function orderedCities(segments) {
  const cities = [];
  const seen = new Set();

  segments.forEach((segment) => {
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

function escaped(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function placePopupHtml(properties = {}) {
  const name = escaped(properties.name || 'Lugar');
  const address = escaped(properties.address || '');
  return `<strong>${name}</strong>${address ? `<br>${address}` : ''}`;
}

function geoapifyStyleUrl() {
  const style = encodeURIComponent(config.geoapify.mapStyle);
  const apiKey = encodeURIComponent(config.geoapify.mapApiKey);
  return `https://maps.geoapify.com/v1/styles/${style}/style.json?apiKey=${apiKey}`;
}

function countrySourceId(countryCode) {
  return `atlas-country-${countryCode.toLowerCase()}-source`;
}

function countryLayerId(countryCode) {
  return `atlas-country-${countryCode.toLowerCase()}-fill`;
}

function removeCountryLayer(map, entry) {
  if (map.getLayer(entry.layerId)) map.removeLayer(entry.layerId);
  if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId);
}

function addBaseSourcesAndLayers(map) {
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: emptyFeatureCollection(),
  });
  map.addLayer({
    id: ROUTE_CASING_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#ffffff',
      'line-width': 5,
      'line-opacity': 0.9,
    },
  });
  map.addLayer({
    id: ROUTE_SOLID_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'dashed'], false],
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2,
      'line-opacity': 0.95,
    },
  });
  map.addLayer({
    id: ROUTE_DASHED_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'dashed'], true],
    layout: {
      'line-cap': 'butt',
      'line-join': 'round',
    },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2,
      'line-opacity': 0.95,
      'line-dasharray': [5, 4],
    },
  });

  map.addSource(CITY_SOURCE_ID, {
    type: 'geojson',
    data: emptyFeatureCollection(),
  });
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

  map.addSource(PLACE_SOURCE_ID, {
    type: 'geojson',
    data: emptyFeatureCollection(),
  });
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

  map.addSource(RESULT_SOURCE_ID, {
    type: 'geojson',
    data: emptyFeatureCollection(),
  });
  map.addLayer({
    id: RESULT_LAYER_ID,
    type: 'circle',
    source: RESULT_SOURCE_ID,
    paint: {
      'circle-radius': 7,
      'circle-color': '#0d6078',
      'circle-opacity': 0.95,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}

async function loadCountryFeature(country) {
  const staticFeature = await getStaticCountryBoundary(country.countryCode);
  if (staticFeature) return staticFeature;

  return getCountryLandBoundary({
    countryCode: country.countryCode,
    lat: country.city.lat,
    lon: country.city.lon,
  });
}

export function RouteMap({ segments, updateSegment }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const countryLayersRef = useRef(new Map());
  const countryRequestRef = useRef(0);
  const countrySignatureRef = useRef('');
  const abortRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState(segments[0]?.id || '');

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) || segments[0],
    [segments, selectedSegmentId]
  );

  useEffect(() => {
    if (!segments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(segments[0]?.id || '');
    }
  }, [segments, selectedSegmentId]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !config.geoapify.mapApiKey) return undefined;

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

    const cityPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    });

    const showFeaturePopup = (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== 'Point') return;
      new maplibregl.Popup({ offset: 10 })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(placePopupHtml(feature.properties))
        .addTo(map);
    };

    const showCityPopup = (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== 'Point') return;
      map.getCanvas().style.cursor = 'pointer';
      cityPopup
        .setLngLat(feature.geometry.coordinates)
        .setText(feature.properties?.name || 'Ciudad')
        .addTo(map);
    };

    const clearHover = () => {
      map.getCanvas().style.cursor = '';
      cityPopup.remove();
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const clearPointer = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('load', () => {
      addBaseSourcesAndLayers(map);
      map.on('mouseenter', CITY_LAYER_ID, showCityPopup);
      map.on('mouseleave', CITY_LAYER_ID, clearHover);
      map.on('mouseenter', PLACE_LAYER_ID, setPointer);
      map.on('mouseleave', PLACE_LAYER_ID, clearPointer);
      map.on('mouseenter', RESULT_LAYER_ID, setPointer);
      map.on('mouseleave', RESULT_LAYER_ID, clearPointer);
      map.on('click', PLACE_LAYER_ID, showFeaturePopup);
      map.on('click', RESULT_LAYER_ID, showFeaturePopup);
      setMapReady(true);
    });

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapNode.current);

    return () => {
      observer.disconnect();
      countryRequestRef.current += 1;
      countryLayersRef.current.clear();
      cityPopup.remove();
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const countries = visitedCountries(segments, colorForIndex);
    const signature = countries
      .map(({ countryCode, color }) => `${countryCode}:${color}`)
      .join('|');

    if (countrySignatureRef.current === signature) return undefined;
    countrySignatureRef.current = signature;

    const wantedCodes = new Set(countries.map(({ countryCode }) => countryCode));
    for (const [countryCode, entry] of countryLayersRef.current) {
      if (wantedCodes.has(countryCode)) continue;
      removeCountryLayer(map, entry);
      countryLayersRef.current.delete(countryCode);
    }

    countries.forEach(({ countryCode, color }) => {
      const existing = countryLayersRef.current.get(countryCode);
      if (!existing || existing.color === color) return;
      if (map.getLayer(existing.layerId)) {
        map.setPaintProperty(existing.layerId, 'fill-color', color);
      }
      existing.color = color;
    });

    const requestId = ++countryRequestRef.current;
    const pendingCountries = countries.filter(
      ({ countryCode }) => !countryLayersRef.current.has(countryCode)
    );

    async function paintCountries() {
      let nextIndex = 0;
      const workerCount = Math.min(2, pendingCountries.length);

      async function worker() {
        while (nextIndex < pendingCountries.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const country = pendingCountries[currentIndex];

          try {
            const feature = await loadCountryFeature(country);
            if (requestId !== countryRequestRef.current || !mapRef.current || !feature) return;
            if (countryLayersRef.current.has(country.countryCode)) continue;

            const sourceId = countrySourceId(country.countryCode);
            const layerId = countryLayerId(country.countryCode);
            map.addSource(sourceId, {
              type: 'geojson',
              data: feature,
              maxzoom: 12,
            });
            map.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': country.color,
                'fill-opacity': 0.18,
              },
            }, ROUTE_CASING_LAYER_ID);

            countryLayersRef.current.set(country.countryCode, {
              sourceId,
              layerId,
              color: country.color,
            });
          } catch (boundaryError) {
            console.warn(`[Country coloring] ${country.countryCode}`, boundaryError);
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    }

    paintCountries().catch((boundaryError) => {
      console.warn('[Country coloring] Unexpected failure', boundaryError);
    });

    return () => {
      countryRequestRef.current += 1;
    };
  }, [segments, mapReady]);

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
        geometry: {
          type: 'Point',
          coordinates: [city.lon, city.lat],
        },
      });
      bounds.extend([city.lon, city.lat]);
      boundsCount += 1;
    });

    segments.forEach((segment) => {
      (segment.places || []).forEach((place) => {
        if (!isPlaced(place)) return;
        placeFeatures.push({
          type: 'Feature',
          properties: {
            name: place.name || 'Lugar',
            address: place.address || '',
          },
          geometry: {
            type: 'Point',
            coordinates: [place.lon, place.lat],
          },
        });
        bounds.extend([place.lon, place.lat]);
        boundsCount += 1;
      });
    });

    sourceData(map, ROUTE_SOURCE_ID, {
      type: 'FeatureCollection',
      features: routeFeatures,
    });
    sourceData(map, CITY_SOURCE_ID, {
      type: 'FeatureCollection',
      features: cityFeatures,
    });
    sourceData(map, PLACE_SOURCE_ID, {
      type: 'FeatureCollection',
      features: placeFeatures,
    });

    if (boundsCount === 1) {
      map.easeTo({ center: bounds.getCenter(), zoom: 10, duration: 0 });
    } else if (boundsCount > 1) {
      map.fitBounds(bounds, {
        padding: 84,
        maxZoom: 10,
        duration: 0,
      });
    }
  }, [segments, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    sourceData(map, RESULT_SOURCE_ID, {
      type: 'FeatureCollection',
      features: results
        .filter(isPlaced)
        .map((place) => ({
          type: 'Feature',
          properties: {
            name: place.name || 'Lugar',
            address: place.address || place.formatted || '',
          },
          geometry: {
            type: 'Point',
            coordinates: [place.lon, place.lat],
          },
        })),
    });
  }, [results, mapReady]);

  useEffect(() => {
    abortRef.current?.abort();
    const text = query.trim();

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
        setResults(await searchGeoapifyPlaces(text, { signal: controller.signal }));
      } catch (searchError) {
        if (searchError.name !== 'AbortError') {
          setError(searchError.message || 'No fue posible buscar lugares.');
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, config.geoapify.searchDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function savePlace(place) {
    if (!selectedSegment) return;
    const saved = {
      id: place.id,
      name: place.name,
      address: place.address || place.formatted || '',
      category: place.category || '',
      countryCode: place.countryCode || '',
      lat: Number(place.lat),
      lon: Number(place.lon),
      savedAt: new Date().toISOString(),
    };
    const current = selectedSegment.places || [];
    if (current.some((item) => item.id === saved.id)) return;
    updateSegment(selectedSegment.id, { places: [...current, saved] });
  }

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
          <select
            value={selectedSegment?.id || ''}
            onChange={(event) => setSelectedSegmentId(event.target.value)}
            aria-label="Tramo donde guardar"
          >
            {segments.map((segment, index) => (
              <option key={segment.id} value={segment.id}>Tramo {index + 1}</option>
            ))}
          </select>
        </div>
        {searching && <div className="geo-search__status">Buscando…</div>}
        {error && <div className="geo-search__error">{error}</div>}
        {results.length > 0 && (
          <div className="geo-search__results">
            {results.map((place) => (
              <div className="geo-search__result" key={place.id}>
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.address || place.formatted}</small>
                </span>
                <button type="button" onClick={() => savePlace(place)}>Guardar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
