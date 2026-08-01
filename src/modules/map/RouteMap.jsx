import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config, colorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { isPlaced } from '../trips/tripModel.js';
import {
  LANDMARK_IMAGES,
  landmarkForCity,
} from './cityLandmarks.js';

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
};

const ISO_A2_TO_A3 = {
  AF:'AFG',AL:'ALB',DZ:'DZA',AD:'AND',AO:'AGO',AR:'ARG',AM:'ARM',AU:'AUS',AT:'AUT',AZ:'AZE',
  BS:'BHS',BH:'BHR',BD:'BGD',BY:'BLR',BE:'BEL',BZ:'BLZ',BJ:'BEN',BT:'BTN',BO:'BOL',BA:'BIH',
  BW:'BWA',BR:'BRA',BN:'BRN',BG:'BGR',BF:'BFA',BI:'BDI',CV:'CPV',KH:'KHM',CM:'CMR',CA:'CAN',
  CF:'CAF',TD:'TCD',CL:'CHL',CN:'CHN',CO:'COL',KM:'COM',CD:'COD',CG:'COG',CR:'CRI',HR:'HRV',
  CU:'CUB',CY:'CYP',CZ:'CZE',DK:'DNK',DJ:'DJI',DO:'DOM',EC:'ECU',EG:'EGY',SV:'SLV',GQ:'GNQ',
  ER:'ERI',EE:'EST',SZ:'SWZ',ET:'ETH',FJ:'FJI',FI:'FIN',FR:'FRA',GA:'GAB',GM:'GMB',GE:'GEO',
  DE:'DEU',GH:'GHA',GR:'GRC',GT:'GTM',GN:'GIN',GW:'GNB',GY:'GUY',HT:'HTI',HN:'HND',HU:'HUN',
  IS:'ISL',IN:'IND',ID:'IDN',IR:'IRN',IQ:'IRQ',IE:'IRL',IL:'ISR',IT:'ITA',JM:'JAM',JP:'JPN',
  JO:'JOR',KZ:'KAZ',KE:'KEN',KP:'PRK',KR:'KOR',KW:'KWT',KG:'KGZ',LA:'LAO',LV:'LVA',LB:'LBN',
  LS:'LSO',LR:'LBR',LY:'LBY',LI:'LIE',LT:'LTU',LU:'LUX',MG:'MDG',MW:'MWI',MY:'MYS',MV:'MDV',
  ML:'MLI',MT:'MLT',MR:'MRT',MU:'MUS',MX:'MEX',MD:'MDA',MC:'MCO',MN:'MNG',ME:'MNE',MA:'MAR',
  MZ:'MOZ',MM:'MMR',NA:'NAM',NP:'NPL',NL:'NLD',NZ:'NZL',NI:'NIC',NE:'NER',NG:'NGA',MK:'MKD',
  NO:'NOR',OM:'OMN',PK:'PAK',PA:'PAN',PG:'PNG',PY:'PRY',PE:'PER',PH:'PHL',PL:'POL',PT:'PRT',
  QA:'QAT',RO:'ROU',RU:'RUS',RW:'RWA',SA:'SAU',SN:'SEN',RS:'SRB',SL:'SLE',SK:'SVK',SI:'SVN',
  SO:'SOM',ZA:'ZAF',SS:'SSD',ES:'ESP',LK:'LKA',SD:'SDN',SR:'SUR',SE:'SWE',CH:'CHE',SY:'SYR',
  TJ:'TJK',TZ:'TZA',TH:'THA',TL:'TLS',TG:'TGO',TT:'TTO',TN:'TUN',TR:'TUR',TM:'TKM',UG:'UGA',
  UA:'UKR',AE:'ARE',GB:'GBR',US:'USA',UY:'URY',UZ:'UZB',VE:'VEN',VN:'VNM',YE:'YEM',ZM:'ZMB',ZW:'ZWE',
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

function loadLandmarkImage(map, landmark) {
  if (map.hasImage(landmark.imageId)) return Promise.resolve();

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const width = 192;
        const height = 144;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        if (!map.hasImage(landmark.imageId)) {
          map.addImage(landmark.imageId, imageData, { pixelRatio: 2 });
        }
      } catch (error) {
        console.warn(`[Atlas landmark image: ${landmark.imageId}]`, error);
      }
      resolve();
    };
    image.onerror = () => {
      console.warn(`[Atlas landmark image unavailable: ${landmark.path}]`);
      resolve();
    };
    image.src = landmark.path;
  });
}

async function loadLandmarkImages(map) {
  await Promise.all(LANDMARK_IMAGES.map((landmark) => loadLandmarkImage(map, landmark)));
}

function setupRouteLayers(map, theme) {
  map.addSource(IDS.routeSource, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

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
    paint: {
      'line-color': ['get', 'color'],
      'line-width': theme.routeWidth,
      'line-offset': ['get', 'offset'],
    },
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

  map.addSource(IDS.citySource, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

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
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3, 0.42,
        6, 0.62,
        10, 0.82,
      ],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -8],
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
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
}

function setupCountryLayer(map, theme) {
  if (!theme.paintVisitedCountries) return;
  try {
    map.addSource(IDS.countrySource, {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1',
    });
    map.addLayer({
      id: IDS.countryFill,
      type: 'fill',
      source: IDS.countrySource,
      'source-layer': 'country_boundaries',
      paint: {
        'fill-color': 'transparent',
        'fill-opacity': theme.countryFillOpacity,
      },
    });
  } catch (error) {
    console.warn('[Atlas country layer]', error);
  }
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
  const bendRatio = 0.042 + 0.032 * distanceProgress;
  const bend = distance * bendRatio * direction;
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
  segments.forEach((segment) => {
    if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
    const key = routeKey(segment.origin, segment.destination);
    pairCount[key] = (pairCount[key] || 0) + 1;
  });

  const pairIndex = {};
  const routeFeatures = [];

  segments.forEach((segment, index) => {
    if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
    const key = routeKey(segment.origin, segment.destination);
    pairIndex[key] = pairIndex[key] || 0;
    const duplicateIndex = pairIndex[key];
    const hasDuplicates = (pairCount[key] || 1) > 1;
    const offset = hasDuplicates ? (duplicateIndex % 2 === 0 ? 3 : -3) : 0;
    pairIndex[key] += 1;

    const origin = [segment.origin.lon, segment.origin.lat];
    const destination = [segment.destination.lon, segment.destination.lat];
    const color = colorForIndex(index);
    const transport = dominantTransport(segment);

    routeFeatures.push({
      type: 'Feature',
      properties: { color, isDashed: transport === 'plane', offset, transport, index },
      geometry: { type: 'LineString', coordinates: stylizedCurve(origin, destination) },
    });
  });

  return { type: 'FeatureCollection', features: routeFeatures };
}

function buildCityData(segments) {
  const cities = [];
  const cityByCoordinate = new Map();

  segments.forEach((segment, segmentIndex) => {
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const key = `${city.lon},${city.lat}`;
      if (cityByCoordinate.has(key)) return;

      const landmark = landmarkForCity(city);
      const entry = {
        ...city,
        color: colorForIndex(segmentIndex),
        landmarkIcon: landmark?.imageId || '',
        landmarkLabel: landmark?.label || '',
        landmarkPriority: landmark?.priority || 0,
      };
      cityByCoordinate.set(key, entry);
      cities.push(entry);
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
          landmarkLabel: city.landmarkLabel,
          landmarkPriority: city.landmarkPriority,
        },
        geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
      })),
    },
  };
}

function paintVisitedCountries(map, segments, theme) {
  if (!theme.paintVisitedCountries || !map.getLayer(IDS.countryFill)) return;

  const countryColors = {};
  segments.forEach((segment, index) => {
    [segment.origin, segment.destination].forEach((city) => {
      const alpha2 = city?.countryCode?.toUpperCase();
      const alpha3 = ISO_A2_TO_A3[alpha2];
      if (alpha3 && !countryColors[alpha3]) countryColors[alpha3] = colorForIndex(index);
    });
  });

  const entries = Object.entries(countryColors);
  if (entries.length === 0) {
    map.setPaintProperty(IDS.countryFill, 'fill-color', 'transparent');
    return;
  }

  const expression = ['match', ['get', 'iso_3166_1_alpha_3']];
  entries.forEach(([alpha3, color]) => expression.push(alpha3, color));
  expression.push('transparent');
  map.setPaintProperty(IDS.countryFill, 'fill-color', expression);
}

function drawMapData(map, segments, theme) {
  const routeSource = map.getSource(IDS.routeSource);
  const citySource = map.getSource(IDS.citySource);
  if (!routeSource || !citySource) return;

  routeSource.setData(buildRouteData(segments));

  const { cities, collection } = buildCityData(segments);
  citySource.setData(collection);
  paintVisitedCountries(map, segments, theme);

  const bounds = new mapboxgl.LngLatBounds();
  cities.forEach((city) => bounds.extend([city.lon, city.lat]));
  if (cities.length === 1) {
    map.flyTo({ center: [cities[0].lon, cities[0].lat], zoom: 6, duration: 600 });
  } else if (cities.length > 1) {
    map.fitBounds(bounds, { padding: 100, maxZoom: 12, duration: 700 });
  }
}

function MapCanvas({ themeKey, segments, t }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const latestSegmentsRef = useRef(segments);
  const theme = MAP_THEMES[themeKey];

  useEffect(() => {
    latestSegmentsRef.current = segments;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) drawMapData(map, segments, theme);
  }, [segments, theme]);

  useEffect(() => {
    if (!mapElRef.current || !config.map.accessToken) return undefined;

    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: theme.styleUrl,
      center: [-99.1332, 19.4326],
      zoom: 4,
      projection: 'mercator',
      attributionControl: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    map.doubleClickZoom.disable();

    map.on('load', async () => {
      try {
        await loadLandmarkImages(map);
        setupRouteLayers(map, theme);
        setupCountryLayer(map, theme);
        drawMapData(map, latestSegmentsRef.current, theme);
        map.resize();
      } catch (error) {
        console.error('[Atlas map setup]', error);
      }
    });

    map.on('click', (event) => {
      map.easeTo({ center: event.lngLat, zoom: map.getZoom() + 1, duration: 300 });
    });

    map.on('error', (event) => {
      console.error('[Mapbox error]', event.error?.message || event.error || event);
    });

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

  function selectTheme(nextTheme) {
    if (!MAP_THEMES[nextTheme] || nextTheme === mapTheme) return;
    window.localStorage.setItem('atlas-map-theme', nextTheme);
    setMapTheme(nextTheme);
  }

  return (
    <div className="map-wrap">
      <MapCanvas key={mapTheme} themeKey={mapTheme} segments={segments} t={t} />

      {config.map.accessToken && (
        <div
          className="map-theme-selector"
          role="group"
          aria-label="Estilo del mapa"
          style={{
            position: 'absolute',
            top: 14,
            left: 'calc(40vw + 28px)',
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
      )}
    </div>
  );
}

function routeKey(a, b) {
  const first = `${a.lon},${a.lat}`;
  const second = `${b.lon},${b.lat}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}
