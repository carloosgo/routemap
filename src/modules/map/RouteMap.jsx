import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config, colorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { isPlaced } from '../trips/tripModel.js';
import { searchArcgisPlaces } from '../places/arcgisPlacesProvider.js';
import { LANDMARK_IMAGES, landmarkForCity } from './cityLandmarks.js';

mapboxgl.accessToken = config.map.accessToken;

const MAP_THEMES = {
  light: {
    label: 'Light',
    styleUrl: 'mapbox://styles/mapbox/light-v11',
    paintVisitedCountries: true,
    countryFillOpacity: 0.09,
    routeWidth: 1.8,
    routeHaloWidth: 4,
    routeHaloColor: '#ffffff',
    routeHaloOpacity: 0.9,
    pointRadius: 4.5,
    pointStrokeWidth: 2.2,
    textColor: '#222222',
    textHaloColor: '#ffffff',
    textHaloWidth: 2,
  },
  color: {
    label: 'Color',
    styleUrl: 'mapbox://styles/carlosuriel/cms9g0a2y000501qr1fhwb5ah',
    paintVisitedCountries: false,
    countryFillOpacity: 0,
    routeWidth: 2.25,
    routeHaloWidth: 4.5,
    routeHaloColor: '#ffffff',
    routeHaloOpacity: 0.78,
    pointRadius: 5.4,
    pointStrokeWidth: 2.5,
    textColor: '#202733',
    textHaloColor: '#ffffff',
    textHaloWidth: 2.25,
  },
};

const IDS = {
  countrySource: 'atlas-country-boundaries',
  countryFill: 'atlas-countries-fill',
  routeSource: 'atlas-routes',
  routeHalo: 'atlas-routes-halo',
  routeSolid: 'atlas-routes-solid',
  routeDashed: 'atlas-routes-dashed',
  citySource: 'atlas-city-points',
  cityDots: 'atlas-city-dots',
  cityLandmarks: 'atlas-city-landmarks',
  cityLabels: 'atlas-city-labels',
  searchSource: 'atlas-place-search-results',
  searchPoints: 'atlas-place-search-points',
  searchLabels: 'atlas-place-search-labels',
};

const ISO_A2_TO_A3 = {
  FR: 'FRA', DE: 'DEU', ES: 'ESP', IT: 'ITA', PT: 'PRT', GB: 'GBR', IE: 'IRL',
  NL: 'NLD', BE: 'BEL', LU: 'LUX', CH: 'CHE', AT: 'AUT', PL: 'POL', CZ: 'CZE',
  SK: 'SVK', HU: 'HUN', RO: 'ROU', BG: 'BGR', GR: 'GRC', HR: 'HRV', SI: 'SVN',
  DK: 'DNK', SE: 'SWE', NO: 'NOR', FI: 'FIN', IS: 'ISL', EE: 'EST', LV: 'LVA',
  LT: 'LTU', MX: 'MEX', US: 'USA', CA: 'CAN', BR: 'BRA', AR: 'ARG', CL: 'CHL',
  CO: 'COL', PE: 'PER', JP: 'JPN', CN: 'CHN', KR: 'KOR', IN: 'IND', AU: 'AUS',
  NZ: 'NZL', TR: 'TUR', UA: 'UKR', RU: 'RUS', IL: 'ISR', EG: 'EGY', MA: 'MAR',
};

const EUROPE_REFERENCE = [10, 50];
const STRAIGHT_ROUTE_THRESHOLD_KM = 1600;

function dominantTransport(segment) {
  const transport = segment?.expenses?.transport || {};
  const candidates = [
    { type: 'plane', amount: transport.plane || 0 },
    { type: 'train', amount: transport.train || 0 },
    { type: 'bus', amount: transport.bus || 0 },
    { type: 'car', amount: transport.taxiUber || 0 },
  ];
  const top = candidates.reduce((current, candidate) =>
    candidate.amount > current.amount ? candidate : current
  );
  return top.amount > 0 ? top.type : null;
}

function routeKey(a, b) {
  const first = `${a.lon},${a.lat}`;
  const second = `${b.lon},${b.lat}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function distanceKm(origin, destination) {
  const toRadians = (value) => value * Math.PI / 180;
  const [lon1, lat1] = origin;
  const [lon2, lat2] = destination;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const firstLat = toRadians(lat1);
  const secondLat = toRadians(lat2);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function outwardCurveDirection(origin, destination) {
  const [x1, y1] = origin;
  const [x2, y2] = destination;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const midpoint = [(x1 + x2) / 2, (y1 + y2) / 2];
  const normal = [-dy / length, dx / length];
  const mostlyHorizontal = Math.abs(dx) >= Math.abs(dy) * 1.15;
  const centralEuropeRoute = midpoint[1] >= 46.5 && midpoint[0] >= 12;
  const northernEuropeRoute = midpoint[1] >= 50.5;

  if (mostlyHorizontal && (centralEuropeRoute || northernEuropeRoute)) {
    return normal[1] >= 0 ? 1 : -1;
  }

  const sampleDistance = Math.max(1, length * 0.15);
  const positive = [midpoint[0] + normal[0] * sampleDistance, midpoint[1] + normal[1] * sampleDistance];
  const negative = [midpoint[0] - normal[0] * sampleDistance, midpoint[1] - normal[1] * sampleDistance];
  const positiveDistance = Math.hypot(positive[0] - EUROPE_REFERENCE[0], positive[1] - EUROPE_REFERENCE[1]);
  const negativeDistance = Math.hypot(negative[0] - EUROPE_REFERENCE[0], negative[1] - EUROPE_REFERENCE[1]);
  return positiveDistance >= negativeDistance ? 1 : -1;
}

function stylizedCurve(origin, destination, steps = 64) {
  const routeDistanceKm = distanceKm(origin, destination);
  if (routeDistanceKm >= STRAIGHT_ROUTE_THRESHOLD_KM) return [origin, destination];

  const [x1, y1] = origin;
  const [x2, y2] = destination;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  if (!distance) return [origin, destination];

  const direction = outwardCurveDirection(origin, destination);
  const distanceProgress = Math.min(1, routeDistanceKm / STRAIGHT_ROUTE_THRESHOLD_KM);
  const bend = distance * (0.042 + 0.032 * distanceProgress) * direction;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const control1 = [x1 + dx * 0.34 + normalX * bend, y1 + dy * 0.34 + normalY * bend];
  const control2 = [x1 + dx * 0.66 + normalX * bend, y1 + dy * 0.66 + normalY * bend];
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const time = index / steps;
    const remaining = 1 - time;
    points.push([
      remaining ** 3 * x1 + 3 * remaining ** 2 * time * control1[0] + 3 * remaining * time ** 2 * control2[0] + time ** 3 * x2,
      remaining ** 3 * y1 + 3 * remaining ** 2 * time * control1[1] + 3 * remaining * time ** 2 * control2[1] + time ** 3 * y2,
    ]);
  }
  return points;
}

function buildRouteData(segments) {
  const pairCount = {};
  const pairIndex = {};
  const features = [];

  segments.forEach((segment) => {
    if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
    const key = routeKey(segment.origin, segment.destination);
    pairCount[key] = (pairCount[key] || 0) + 1;
  });

  segments.forEach((segment, index) => {
    if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
    const key = routeKey(segment.origin, segment.destination);
    pairIndex[key] = pairIndex[key] || 0;
    const duplicateIndex = pairIndex[key];
    const offset = (pairCount[key] || 1) > 1 ? (duplicateIndex % 2 === 0 ? 3 : -3) : 0;
    pairIndex[key] += 1;
    const origin = [segment.origin.lon, segment.origin.lat];
    const destination = [segment.destination.lon, segment.destination.lat];
    const transport = dominantTransport(segment);

    features.push({
      type: 'Feature',
      properties: {
        color: colorForIndex(index),
        isDashed: transport === 'plane',
        offset,
        transport,
        index,
      },
      geometry: { type: 'LineString', coordinates: stylizedCurve(origin, destination) },
    });
  });

  return { type: 'FeatureCollection', features };
}

function buildCityData(segments) {
  const cities = [];
  const seen = new Set();

  segments.forEach((segment, segmentIndex) => {
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const key = `${city.lon},${city.lat}`;
      if (seen.has(key)) return;
      seen.add(key);
      const landmark = landmarkForCity(city);
      cities.push({
        ...city,
        color: colorForIndex(segmentIndex),
        landmarkIcon: landmark?.imageId || '',
        landmarkPriority: landmark?.priority || 0,
      });
    });
  });

  return {
    cities,
    collection: {
      type: 'FeatureCollection',
      features: cities.map((city) => ({
        type: 'Feature',
        properties: {
          name: city.name,
          countryCode: city.countryCode || '',
          color: city.color,
          landmarkIcon: city.landmarkIcon,
          landmarkPriority: city.landmarkPriority,
        },
        geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
      })),
    },
  };
}

function buildSearchData(results) {
  return {
    type: 'FeatureCollection',
    features: results.map((place, index) => ({
      type: 'Feature',
      id: index,
      properties: {
        id: place.id,
        name: place.name,
        address: place.address,
        category: place.category,
        score: place.score,
      },
      geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
    })),
  };
}

function loadLandmarkImage(map, landmark) {
  if (map.hasImage(landmark.imageId)) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 144;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (!map.hasImage(landmark.imageId)) {
          map.addImage(landmark.imageId, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 });
        }
      } catch (error) {
        console.warn(`[Atlas landmark image: ${landmark.imageId}]`, error);
      }
      resolve();
    };
    image.onerror = resolve;
    image.src = landmark.path;
  });
}

async function setupLayers(map, theme) {
  await Promise.all(LANDMARK_IMAGES.map((landmark) => loadLandmarkImage(map, landmark)));

  map.addSource(IDS.routeSource, { type: 'geojson', data: buildRouteData([]) });
  map.addLayer({
    id: IDS.routeHalo,
    type: 'line',
    source: IDS.routeSource,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': theme.routeHaloColor,
      'line-width': theme.routeHaloWidth,
      'line-opacity': theme.routeHaloOpacity,
      'line-offset': ['get', 'offset'],
    },
  });
  map.addLayer({
    id: IDS.routeSolid,
    type: 'line',
    source: IDS.routeSource,
    filter: ['==', ['get', 'isDashed'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': theme.routeWidth, 'line-offset': ['get', 'offset'] },
  });
  map.addLayer({
    id: IDS.routeDashed,
    type: 'line',
    source: IDS.routeSource,
    filter: ['==', ['get', 'isDashed'], true],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': theme.routeWidth,
      'line-dasharray': [5, 4],
      'line-offset': ['get', 'offset'],
    },
  });

  map.addSource(IDS.citySource, { type: 'geojson', data: buildCityData([]).collection });
  map.addLayer({
    id: IDS.cityDots,
    type: 'circle',
    source: IDS.citySource,
    paint: {
      'circle-radius': theme.pointRadius,
      'circle-color': '#ffffff',
      'circle-stroke-width': theme.pointStrokeWidth,
      'circle-stroke-color': ['get', 'color'],
    },
  });
  map.addLayer({
    id: IDS.cityLandmarks,
    type: 'symbol',
    source: IDS.citySource,
    filter: ['!=', ['get', 'landmarkIcon'], ''],
    layout: {
      'icon-image': ['get', 'landmarkIcon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.42, 6, 0.62, 10, 0.82],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -8],
      'icon-allow-overlap': false,
      'icon-optional': true,
      'symbol-sort-key': ['get', 'landmarkPriority'],
    },
  });
  map.addLayer({
    id: IDS.cityLabels,
    type: 'symbol',
    source: IDS.citySource,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-anchor': 'left',
      'text-offset': [0.8, 0],
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': theme.textColor,
      'text-halo-color': theme.textHaloColor,
      'text-halo-width': theme.textHaloWidth,
    },
  });

  map.addSource(IDS.searchSource, { type: 'geojson', data: buildSearchData([]), cluster: true, clusterRadius: 38 });
  map.addLayer({
    id: IDS.searchPoints,
    type: 'circle',
    source: IDS.searchSource,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 7,
      'circle-color': '#0d6078',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });
  map.addLayer({
    id: IDS.searchLabels,
    type: 'symbol',
    source: IDS.searchSource,
    filter: ['!', ['has', 'point_count']],
    minzoom: 12,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'text-optional': true,
    },
    paint: { 'text-color': '#15313a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });

  if (theme.paintVisitedCountries) {
    try {
      map.addSource(IDS.countrySource, { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' });
      map.addLayer({
        id: IDS.countryFill,
        type: 'fill',
        source: IDS.countrySource,
        'source-layer': 'country_boundaries',
        paint: { 'fill-color': 'transparent', 'fill-opacity': theme.countryFillOpacity },
      }, IDS.routeHalo);
    } catch (error) {
      console.warn('[Atlas country layer]', error);
    }
  }
}

function paintVisitedCountries(map, segments, theme) {
  if (!theme.paintVisitedCountries || !map.getLayer(IDS.countryFill)) return;
  const colors = {};
  segments.forEach((segment, index) => {
    [segment.origin, segment.destination].forEach((city) => {
      const alpha3 = ISO_A2_TO_A3[city?.countryCode?.toUpperCase()];
      if (alpha3 && !colors[alpha3]) colors[alpha3] = colorForIndex(index);
    });
  });
  const entries = Object.entries(colors);
  if (!entries.length) {
    map.setPaintProperty(IDS.countryFill, 'fill-color', 'transparent');
    return;
  }
  const expression = ['match', ['get', 'iso_3166_1_alpha_3']];
  entries.forEach(([code, color]) => expression.push(code, color));
  expression.push('transparent');
  map.setPaintProperty(IDS.countryFill, 'fill-color', expression);
}

function drawMapData(map, segments, results, theme, fitToSearch = false) {
  const routeSource = map.getSource(IDS.routeSource);
  const citySource = map.getSource(IDS.citySource);
  const searchSource = map.getSource(IDS.searchSource);
  if (!routeSource || !citySource || !searchSource) return;

  routeSource.setData(buildRouteData(segments));
  const { cities, collection } = buildCityData(segments);
  citySource.setData(collection);
  searchSource.setData(buildSearchData(results));
  paintVisitedCountries(map, segments, theme);

  const points = fitToSearch && results.length ? results : cities;
  const bounds = new mapboxgl.LngLatBounds();
  points.forEach((point) => bounds.extend([point.lon, point.lat]));
  if (points.length === 1) {
    map.flyTo({ center: [points[0].lon, points[0].lat], zoom: fitToSearch ? 15 : 6, duration: 600 });
  } else if (points.length > 1) {
    map.fitBounds(bounds, { padding: 90, maxZoom: fitToSearch ? 14 : 12, duration: 700 });
  }
}

function MapCanvas({ themeKey, segments, searchResults, searchRevision, t }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const latestRef = useRef({ segments, searchResults, searchRevision });
  const theme = MAP_THEMES[themeKey];

  useEffect(() => {
    const previousRevision = latestRef.current.searchRevision;
    latestRef.current = { segments, searchResults, searchRevision };
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      drawMapData(map, segments, searchResults, theme, searchRevision !== previousRevision);
    }
  }, [segments, searchResults, searchRevision, theme]);

  useEffect(() => {
    if (!mapElRef.current || !config.map.accessToken) return undefined;
    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: theme.styleUrl,
      center: config.map.initialCenter,
      zoom: config.map.initialZoom,
      projection: 'mercator',
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    map.doubleClickZoom.disable();

    map.on('load', async () => {
      try {
        await setupLayers(map, theme);
        const latest = latestRef.current;
        drawMapData(map, latest.segments, latest.searchResults, theme, latest.searchResults.length > 0);
        map.resize();
      } catch (error) {
        console.error('[Atlas map setup]', error);
      }
    });

    map.on('click', IDS.searchPoints, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const coordinates = feature.geometry.coordinates.slice();
      const name = feature.properties?.name || 'Lugar';
      const address = feature.properties?.address || '';
      new mapboxgl.Popup({ offset: 12 })
        .setLngLat(coordinates)
        .setHTML(`<strong>${name}</strong>${address ? `<br><span>${address}</span>` : ''}`)
        .addTo(map);
    });
    map.on('mouseenter', IDS.searchPoints, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', IDS.searchPoints, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', (event) => {
      const hit = map.queryRenderedFeatures(event.point, { layers: [IDS.searchPoints] });
      if (!hit.length) map.easeTo({ center: event.lngLat, zoom: map.getZoom() + 1, duration: 300 });
    });
    map.on('error', (event) => console.error('[Mapbox error]', event.error?.message || event.error || event));

    const resizeObserver = new window.ResizeObserver(() => map.resize());
    resizeObserver.observe(mapElRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  return (
    <div className="map" ref={mapElRef}>
      {!config.map.accessToken && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          {t('mapConfigMissing')}
        </div>
      )}
    </div>
  );
}

export function RouteMap({ segments }) {
  const { t } = useTranslation();
  const [mapTheme, setMapTheme] = useState(() => {
    const stored = window.localStorage.getItem('atlas-map-theme');
    return MAP_THEMES[stored] ? stored : 'color';
  });
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchRevision, setSearchRevision] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const abortRef = useRef(null);

  function selectTheme(nextTheme) {
    if (!MAP_THEMES[nextTheme] || nextTheme === mapTheme) return;
    window.localStorage.setItem('atlas-map-theme', nextTheme);
    setMapTheme(nextTheme);
  }

  async function handlePlaceSearch(event) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 3) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError('');
    try {
      const results = await searchArcgisPlaces(text, {
        signal: controller.signal,
        limit: config.arcgis.placeSearchLimit,
      });
      setSearchResults(results);
      setSearchRevision((value) => value + 1);
      if (!results.length) setSearchError('No se encontraron lugares para esta búsqueda.');
    } catch (error) {
      if (error.name !== 'AbortError') setSearchError(error.message || 'No fue posible buscar lugares.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  function clearSearch() {
    abortRef.current?.abort();
    setQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearching(false);
    setSearchRevision((value) => value + 1);
  }

  return (
    <div className="map-wrap">
      <MapCanvas
        key={mapTheme}
        themeKey={mapTheme}
        segments={segments}
        searchResults={searchResults}
        searchRevision={searchRevision}
        t={t}
      />

      {config.map.accessToken && (
        <>
          <form
            onSubmit={handlePlaceSearch}
            style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 14,
              width: 'min(430px, calc(100% - 210px))',
              display: 'flex',
              gap: 6,
              padding: 5,
              border: '1px solid rgba(148, 163, 184, 0.42)',
              borderRadius: 11,
              background: 'rgba(255, 255, 255, 0.96)',
              boxShadow: '0 5px 18px rgba(15, 23, 42, 0.16)',
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar lugares, por ejemplo: McDonald's, Paris"
              aria-label="Buscar lugares"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, padding: '8px 9px', background: 'transparent', font: 'inherit', fontSize: 12 }}
            />
            {searchResults.length > 0 && (
              <button type="button" onClick={clearSearch} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '0 7px', color: '#64748b' }}>
                Limpiar
              </button>
            )}
            <button
              type="submit"
              disabled={searching || query.trim().length < 3}
              style={{ border: 0, borderRadius: 7, padding: '7px 12px', background: '#0d6078', color: '#fff', font: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: searching ? 0.65 : 1 }}
            >
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </form>

          {(searchResults.length > 0 || searchError) && (
            <div style={{ position: 'absolute', top: 69, left: '50%', transform: 'translateX(-50%)', zIndex: 14, maxWidth: 430, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.94)', boxShadow: '0 3px 12px rgba(15,23,42,.12)', fontSize: 11, color: searchError ? '#b42318' : '#475569' }}>
              {searchError || `${searchResults.length} lugares encontrados · resultados temporales de ArcGIS`}
            </div>
          )}

          <div
            className="map-theme-selector"
            role="group"
            aria-label="Estilo del mapa"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              zIndex: 12,
              display: 'inline-flex',
              gap: 2,
              padding: 3,
              border: '1px solid rgba(148, 163, 184, 0.42)',
              borderRadius: 9,
              background: 'rgba(255, 255, 255, 0.94)',
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.14)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {Object.entries(MAP_THEMES).map(([key, themeOption]) => {
              const active = mapTheme === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectTheme(key)}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    padding: '6px 11px',
                    background: active ? '#0d6078' : 'transparent',
                    color: active ? '#ffffff' : '#596273',
                    font: 'inherit',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {themeOption.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
