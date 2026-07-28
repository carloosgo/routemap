import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config, colorForIndex } from '../../config.js';
import { isPlaced } from '../trips/tripModel.js';

mapboxgl.accessToken = config.map.accessToken;

function dominantTransport(segment) {
  const t = segment?.expenses?.transport || {};
  const candidates = [
    { type: 'plane', amount: t.plane || 0 },
    { type: 'train', amount: t.train || 0 },
    { type: 'bus', amount: t.bus || 0 },
    { type: 'car', amount: t.taxiUber || 0 },
  ];
  const top = candidates.reduce((a, b) => (b.amount > a.amount ? b : a));
  return top.amount > 0 ? top.type : null;
}

const ISO_A2_TO_A3 = {
  AF: 'AFG',
  AL: 'ALB',
  DZ: 'DZA',
  AD: 'AND',
  AO: 'AGO',
  AR: 'ARG',
  AM: 'ARM',
  AU: 'AUS',
  AT: 'AUT',
  AZ: 'AZE',
  BS: 'BHS',
  BH: 'BHR',
  BD: 'BGD',
  BY: 'BLR',
  BE: 'BEL',
  BZ: 'BLZ',
  BJ: 'BEN',
  BT: 'BTN',
  BO: 'BOL',
  BA: 'BIH',
  BW: 'BWA',
  BR: 'BRA',
  BN: 'BRN',
  BG: 'BGR',
  BF: 'BFA',
  BI: 'BDI',
  CV: 'CPV',
  KH: 'KHM',
  CM: 'CMR',
  CA: 'CAN',
  CF: 'CAF',
  TD: 'TCD',
  CL: 'CHL',
  CN: 'CHN',
  CO: 'COL',
  KM: 'COM',
  CD: 'COD',
  CG: 'COG',
  CR: 'CRI',
  HR: 'HRV',
  CU: 'CUB',
  CY: 'CYP',
  CZ: 'CZE',
  DK: 'DNK',
  DJ: 'DJI',
  DO: 'DOM',
  EC: 'ECU',
  EG: 'EGY',
  SV: 'SLV',
  GQ: 'GNQ',
  ER: 'ERI',
  EE: 'EST',
  SZ: 'SWZ',
  ET: 'ETH',
  FJ: 'FJI',
  FI: 'FIN',
  FR: 'FRA',
  GA: 'GAB',
  GM: 'GMB',
  GE: 'GEO',
  DE: 'DEU',
  GH: 'GHA',
  GR: 'GRC',
  GT: 'GTM',
  GN: 'GIN',
  GW: 'GNB',
  GY: 'GUY',
  HT: 'HTI',
  HN: 'HND',
  HU: 'HUN',
  IS: 'ISL',
  IN: 'IND',
  ID: 'IDN',
  IR: 'IRN',
  IQ: 'IRQ',
  IE: 'IRL',
  IL: 'ISR',
  IT: 'ITA',
  JM: 'JAM',
  JP: 'JPN',
  JO: 'JOR',
  KZ: 'KAZ',
  KE: 'KEN',
  KP: 'PRK',
  KR: 'KOR',
  KW: 'KWT',
  KG: 'KGZ',
  LA: 'LAO',
  LV: 'LVA',
  LB: 'LBN',
  LS: 'LSO',
  LR: 'LBR',
  LY: 'LBY',
  LI: 'LIE',
  LT: 'LTU',
  LU: 'LUX',
  MG: 'MDG',
  MW: 'MWI',
  MY: 'MYS',
  MV: 'MDV',
  ML: 'MLI',
  MT: 'MLT',
  MR: 'MRT',
  MU: 'MUS',
  MX: 'MEX',
  MD: 'MDA',
  MC: 'MCO',
  MN: 'MNG',
  ME: 'MNE',
  MA: 'MAR',
  MZ: 'MOZ',
  MM: 'MMR',
  NA: 'NAM',
  NP: 'NPL',
  NL: 'NLD',
  NZ: 'NZL',
  NI: 'NIC',
  NE: 'NER',
  NG: 'NGA',
  MK: 'MKD',
  NO: 'NOR',
  OM: 'OMN',
  PK: 'PAK',
  PA: 'PAN',
  PG: 'PNG',
  PY: 'PRY',
  PE: 'PER',
  PH: 'PHL',
  PL: 'POL',
  PT: 'PRT',
  QA: 'QAT',
  RO: 'ROU',
  RU: 'RUS',
  RW: 'RWA',
  SA: 'SAU',
  SN: 'SEN',
  RS: 'SRB',
  SL: 'SLE',
  SK: 'SVK',
  SI: 'SVN',
  SO: 'SOM',
  ZA: 'ZAF',
  SS: 'SSD',
  ES: 'ESP',
  LK: 'LKA',
  SD: 'SDN',
  SR: 'SUR',
  SE: 'SWE',
  CH: 'CHE',
  SY: 'SYR',
  TJ: 'TJK',
  TZ: 'TZA',
  TH: 'THA',
  TL: 'TLS',
  TG: 'TGO',
  TT: 'TTO',
  TN: 'TUN',
  TR: 'TUR',
  TM: 'TKM',
  UG: 'UGA',
  UA: 'UKR',
  AE: 'ARE',
  GB: 'GBR',
  US: 'USA',
  UY: 'URY',
  UZ: 'UZB',
  VE: 'VEN',
  VN: 'VNM',
  YE: 'YEM',
  ZM: 'ZMB',
  ZW: 'ZWE',
};

const CITY_ICONS = {
  paris: 'fr-paris',
  amsterdam: 'nl-amsterdam',
  berlin: 'de-berlin',
  budapest: 'hu-budapest',
  munich: 'de-munich',
  munchen: 'de-munich',
  nuremberg: 'de-nuremberg',
  nurnberg: 'de-nuremberg',
  bruges: 'be-bruges',
  brujas: 'be-bruges',
  brugge: 'be-bruges',
  barcelona: 'es-barcelona',
  madrid: 'es-madrid',
  vienna: 'at-vienna',
  wien: 'at-vienna',
  viena: 'at-vienna',
};

function getCityIcon(cityName) {
  const key = (cityName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return CITY_ICONS[key] || null;
}

function getVisitedCountries(segments) {
  const countryColor = {};
  segments.forEach((segment, index) => {
    const color = colorForIndex(index);
    [segment.origin, segment.destination].forEach((city) => {
      if (!city?.countryCode) return;
      const code = city.countryCode.toUpperCase();
      if (!countryColor[code]) countryColor[code] = color;
    });
  });
  return countryColor;
}

export function RouteMap({ segments }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const loadedRef = useRef(false);
  const latestSegmentsRef = useRef(segments);

  useEffect(() => {
    latestSegmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (!mapElRef.current) return;
    if (!config.map.accessToken) {
      mapElRef.current.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:#64748b;font-size:13px;">Falta configurar VITE_MAPBOX_TOKEN en tu archivo .env.local.</div>';
      return;
    }

    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: 'mapbox://styles/carlosuriel/cmrzizttl00l901s8d8ye6iel',
      center: [-99.1332, 19.4326],
      zoom: 4,
      projection: 'mercator',
      attributionControl: true,
    });

    mapRef.current = map;
    window.__routeMap = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    map.doubleClickZoom.disable();

    map.on('click', (e) => {
      if (e.originalEvent?.target?.closest?.('.map-marker')) return;
      map.easeTo({ center: e.lngLat, zoom: map.getZoom() + 1, duration: 300 });
    });

    map.on('error', (e) => {
      console.error('[Mapbox error]', e.error?.message || e.error || e);
    });

    map.on('load', () => {
      map.resize();

      // Países visitados
      map.addSource('country-boundaries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      });

      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'country-boundaries',
        'source-layer': 'country_boundaries',
        paint: {
          'fill-color': 'transparent',
          'fill-opacity': 0.09,
        },
      });

      // Rutas
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'routes-halo',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 4,
          'line-opacity': 0.9,
          'line-offset': ['get', 'offset'],
        },
      });

      map.addLayer({
        id: 'routes-solid',
        type: 'line',
        source: 'routes',
        filter: ['!', ['get', 'isDashed']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-offset': ['get', 'offset'],
        },
      });

      map.addLayer({
        id: 'routes-dashed',
        type: 'line',
        source: 'routes',
        filter: ['get', 'isDashed'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-dasharray': [5, 4],
          'line-offset': ['get', 'offset'],
        },
      });

      // Flechas de dirección
      const arrowSize = 8;
      const canvas = document.createElement('canvas');
      canvas.width = arrowSize;
      canvas.height = arrowSize;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.moveTo(arrowSize, arrowSize / 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(arrowSize * 0.3, arrowSize / 2);
      ctx.lineTo(0, arrowSize);
      ctx.closePath();
      ctx.fill();
      const imgData = ctx.getImageData(0, 0, arrowSize, arrowSize);
      if (!map.hasImage('arrow-white')) {
        map.addImage('arrow-white', {
          width: arrowSize,
          height: arrowSize,
          data: imgData.data,
        });
      }

      map.addLayer({
        id: 'routes-arrows',
        type: 'symbol',
        source: 'routes',
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 100,
          'icon-image': 'arrow-white',
          'icon-size': 0.8,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      // Fuente de ciudades
      map.addSource('city-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Punto de color en la coordenada exacta
      map.addLayer({
        id: 'city-dots',
        type: 'circle',
        source: 'city-points',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Monumento + nombre — una sola capa symbol, sin duplicar el texto
      map.addLayer({
        id: 'city-icons',
        type: 'symbol',
        source: 'city-points',
        layout: {
          'icon-image': ['case', ['!=', ['get', 'icon'], ''], ['get', 'icon'], ''],
          'icon-size': 0.25,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'bottom',
          'icon-offset': [0, -38],
          'text-field': ['get', 'name'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.4],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#222222',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      });

      loadedRef.current = true;
      drawRoutes(map, markersRef, latestSegmentsRef.current);
    });

    const ro = new window.ResizeObserver(() => map.resize());
    ro.observe(mapElRef.current);

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      delete window.__routeMap;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    drawRoutes(map, markersRef, segments);
  }, [segments]);

  return <div className="map" ref={mapElRef} />;
}

function drawRoutes(map, markersRef, segments) {
  const routeSource = map.getSource('routes');
  const cityPointsSource = map.getSource('city-points');
  if (!routeSource || !cityPointsSource) return;

  // Limpiar marcadores HTML anteriores
  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  // --- Países visitados ---
  const countryColor = getVisitedCountries(segments);
  const visitedCodes = Object.keys(countryColor);

  if (!map.getLayer('countries-fill')) {
    // capa aún no lista
  } else if (visitedCodes.length > 0) {
    const fillExpr = ['match', ['get', 'iso_3166_1_alpha_3']];
    visitedCodes.forEach((alpha2) => {
      const alpha3 = ISO_A2_TO_A3[alpha2];
      if (!alpha3) return;
      fillExpr.push(alpha3, countryColor[alpha2]);
    });
    fillExpr.push('transparent');
    map.setPaintProperty('countries-fill', 'fill-color', fillExpr);
  } else {
    map.setPaintProperty('countries-fill', 'fill-color', 'transparent');
  }

  // --- Líneas de ruta ---
  const features = [];
  const pairCount = {};

  segments.forEach((seg) => {
    if (!isPlaced(seg.origin) || !isPlaced(seg.destination)) return;
    const key = routeKey(seg.origin, seg.destination);
    pairCount[key] = (pairCount[key] || 0) + 1;
  });

  const pairIndex = {};

  segments.forEach((segment, index) => {
    if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;

    const color = colorForIndex(index);
    const transport = dominantTransport(segment);
    const isDashed = transport === 'plane';
    const key = routeKey(segment.origin, segment.destination);
    pairIndex[key] = pairIndex[key] || 0;
    const isMulti = (pairCount[key] || 1) > 1;
    const offset = isMulti ? (pairIndex[key] % 2 === 0 ? 5 : -5) : 0;
    pairIndex[key]++;

    const coords = adaptiveCurve(
      [segment.origin.lon, segment.origin.lat],
      [segment.destination.lon, segment.destination.lat]
    );

    features.push({
      type: 'Feature',
      properties: { color, isDashed, offset, transport, index },
      geometry: { type: 'LineString', coordinates: coords },
    });
  });

  routeSource.setData({ type: 'FeatureCollection', features });

  // --- Puntos y monumentos de ciudad ---
  const cities = [];
  segments.forEach((segment) => {
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const last = cities[cities.length - 1];
      if (last && last.lat === city.lat && last.lon === city.lon) return;
      cities.push(city);
    });
  });

  cityPointsSource.setData({
    type: 'FeatureCollection',
    features: cities.map((city, i) => ({
      type: 'Feature',
      properties: {
        name: city.name,
        color: colorForIndex(i),
        icon: getCityIcon(city.name) || '',
      },
      geometry: {
        type: 'Point',
        coordinates: [city.lon, city.lat],
      },
    })),
  });

  // --- Zoom ---
  const bounds = new mapboxgl.LngLatBounds();
  cities.forEach((city) => bounds.extend([city.lon, city.lat]));

  if (cities.length === 1) {
    map.flyTo({ center: [cities[0].lon, cities[0].lat], zoom: 6, duration: 600 });
  } else if (cities.length > 1) {
    map.fitBounds(bounds, { padding: 100, maxZoom: 12, duration: 700 });
  }
}

function adaptiveCurve(a, b, steps = 80) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curveFactor = Math.max(0, Math.min(0.22, 0.22 - (dist - 1) * 0.04));
  const offset = dist * curveFactor;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const len = dist || 1;
  const cx = mx + (-dy / len) * offset;
  const cy = my + (dx / len) * offset;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * cx + t * t * b[0],
      u * u * a[1] + 2 * u * t * cy + t * t * b[1],
    ]);
  }
  return pts;
}

function routeKey(a, b) {
  const p1 = `${a.lon},${a.lat}`;
  const p2 = `${b.lon},${b.lat}`;
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}
