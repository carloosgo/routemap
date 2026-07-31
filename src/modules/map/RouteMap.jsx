import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config, colorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { isPlaced } from '../trips/tripModel.js';

mapboxgl.accessToken = config.map.accessToken;

const MAP_THEMES = {
  light: {
    label: 'Light',
    styleUrl: 'mapbox://styles/carlosuriel/cmrzizttl00l901s8d8ye6iel',
    paintVisitedCountries: true,
    countryFillOpacity: 0.09,
    routeWidth: 1.5,
    routeHaloWidth: 4,
    routeHaloColor: '#ffffff',
    routeHaloOpacity: 0.9,
    pointRadius: 5,
    pointStrokeWidth: 2,
    pointStrokeColor: '#ffffff',
    arrowColor: '#333333',
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
    pointRadius: 6,
    pointStrokeWidth: 2.5,
    pointStrokeColor: '#ffffff',
    arrowColor: '#202733',
    textColor: '#202733',
    textHaloColor: '#ffffff',
    textHaloWidth: 2.25,
  },
};

function dominantTransport(segment) {
  const transport = segment?.expenses?.transport || {};
  const candidates = [
    { type: 'plane', amount: transport.plane || 0 },
    { type: 'train', amount: transport.train || 0 },
    { type: 'bus', amount: transport.bus || 0 },
    { type: 'car', amount: transport.taxiUber || 0 },
  ];
  const top = candidates.reduce((a, b) => (b.amount > a.amount ? b : a));
  return top.amount > 0 ? top.type : null;
}

const ISO_A2_TO_A3 = {
  AF:'AFG',AL:'ALB',DZ:'DZA',AD:'AND',AO:'AGO',AR:'ARG',AM:'ARM',AU:'AUS',
  AT:'AUT',AZ:'AZE',BS:'BHS',BH:'BHR',BD:'BGD',BY:'BLR',BE:'BEL',BZ:'BLZ',
  BJ:'BEN',BT:'BTN',BO:'BOL',BA:'BIH',BW:'BWA',BR:'BRA',BN:'BRN',BG:'BGR',
  BF:'BFA',BI:'BDI',CV:'CPV',KH:'KHM',CM:'CMR',CA:'CAN',CF:'CAF',TD:'TCD',
  CL:'CHL',CN:'CHN',CO:'COL',KM:'COM',CD:'COD',CG:'COG',CR:'CRI',HR:'HRV',
  CU:'CUB',CY:'CYP',CZ:'CZE',DK:'DNK',DJ:'DJI',DO:'DOM',EC:'ECU',EG:'EGY',
  SV:'SLV',GQ:'GNQ',ER:'ERI',EE:'EST',SZ:'SWZ',ET:'ETH',FJ:'FJI',FI:'FIN',
  FR:'FRA',GA:'GAB',GM:'GMB',GE:'GEO',DE:'DEU',GH:'GHA',GR:'GRC',GT:'GTM',
  GN:'GIN',GW:'GNB',GY:'GUY',HT:'HTI',HN:'HND',HU:'HUN',IS:'ISL',IN:'IND',
  ID:'IDN',IR:'IRN',IQ:'IRQ',IE:'IRL',IL:'ISR',IT:'ITA',JM:'JAM',JP:'JPN',
  JO:'JOR',KZ:'KAZ',KE:'KEN',KP:'PRK',KR:'KOR',KW:'KWT',KG:'KGZ',LA:'LAO',
  LV:'LVA',LB:'LBN',LS:'LSO',LR:'LBR',LY:'LBY',LI:'LIE',LT:'LTU',LU:'LUX',
  MG:'MDG',MW:'MWI',MY:'MYS',MV:'MDV',ML:'MLI',MT:'MLT',MR:'MRT',MU:'MUS',
  MX:'MEX',MD:'MDA',MC:'MCO',MN:'MNG',ME:'MNE',MA:'MAR',MZ:'MOZ',MM:'MMR',
  NA:'NAM',NP:'NPL',NL:'NLD',NZ:'NZL',NI:'NIC',NE:'NER',NG:'NGA',MK:'MKD',
  NO:'NOR',OM:'OMN',PK:'PAK',PA:'PAN',PG:'PNG',PY:'PRY',PE:'PER',PH:'PHL',
  PL:'POL',PT:'PRT',QA:'QAT',RO:'ROU',RU:'RUS',RW:'RWA',SA:'SAU',SN:'SEN',
  RS:'SRB',SL:'SLE',SK:'SVK',SI:'SVN',SO:'SOM',ZA:'ZAF',SS:'SSD',ES:'ESP',
  LK:'LKA',SD:'SDN',SR:'SUR',SE:'SWE',CH:'CHE',SY:'SYR',TJ:'TJK',TZ:'TZA',
  TH:'THA',TL:'TLS',TG:'TGO',TT:'TTO',TN:'TUN',TR:'TUR',TM:'TKM',UG:'UGA',
  UA:'UKR',AE:'ARE',GB:'GBR',US:'USA',UY:'URY',UZ:'UZB',VE:'VEN',VN:'VNM',
  YE:'YEM',ZM:'ZMB',ZW:'ZWE',
};

const CITY_ICONS = {
  paris:'fr-paris',amsterdam:'nl-amsterdam',berlin:'de-berlin',budapest:'hu-budapest',
  munich:'de-munich',munchen:'de-munich',nuremberg:'de-nuremberg',nurnberg:'de-nuremberg',
  bruges:'be-bruges',brujas:'be-bruges',brugge:'be-bruges',barcelona:'es-barcelona',
  madrid:'es-madrid',vienna:'at-vienna',wien:'at-vienna',viena:'at-vienna',
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

function setupLayers(map, theme) {
  if (!map.getSource('country-boundaries')) {
    map.addSource('country-boundaries', {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1',
    });
  }
  if (!map.getLayer('countries-fill')) {
    map.addLayer({
      id: 'countries-fill',
      type: 'fill',
      source: 'country-boundaries',
      'source-layer': 'country_boundaries',
      paint: {
        'fill-color': 'transparent',
        'fill-opacity': theme.countryFillOpacity,
      },
    });
  }

  if (!map.getSource('routes')) {
    map.addSource('routes', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('routes-halo')) {
    map.addLayer({
      id: 'routes-halo',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': theme.routeHaloColor,
        'line-width': theme.routeHaloWidth,
        'line-opacity': theme.routeHaloOpacity,
        'line-offset': ['get', 'offset'],
      },
    });
  }
  if (!map.getLayer('routes-solid')) {
    map.addLayer({
      id: 'routes-solid',
      type: 'line',
      source: 'routes',
      filter: ['!', ['get', 'isDashed']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': theme.routeWidth,
        'line-offset': ['get', 'offset'],
      },
    });
  }
  if (!map.getLayer('routes-dashed')) {
    map.addLayer({
      id: 'routes-dashed',
      type: 'line',
      source: 'routes',
      filter: ['get', 'isDashed'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': theme.routeWidth,
        'line-dasharray': [5, 4],
        'line-offset': ['get', 'offset'],
      },
    });
  }

  if (!map.hasImage('route-arrow')) {
    const arrowSize = 8;
    const canvas = document.createElement('canvas');
    canvas.width = arrowSize;
    canvas.height = arrowSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.arrowColor;
    ctx.beginPath();
    ctx.moveTo(arrowSize, arrowSize / 2);
    ctx.lineTo(0, 0);
    ctx.lineTo(arrowSize * 0.3, arrowSize / 2);
    ctx.lineTo(0, arrowSize);
    ctx.closePath();
    ctx.fill();
    const imgData = ctx.getImageData(0, 0, arrowSize, arrowSize);
    map.addImage('route-arrow', { width: arrowSize, height: arrowSize, data: imgData.data });
  }
  if (!map.getLayer('routes-arrows')) {
    map.addLayer({
      id: 'routes-arrows',
      type: 'symbol',
      source: 'routes',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 100,
        'icon-image': 'route-arrow',
        'icon-size': 0.8,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
  }

  if (!map.getSource('city-points')) {
    map.addSource('city-points', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('city-dots')) {
    map.addLayer({
      id: 'city-dots',
      type: 'circle',
      source: 'city-points',
      paint: {
        'circle-radius': theme.pointRadius,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': theme.pointStrokeWidth,
        'circle-stroke-color': theme.pointStrokeColor,
      },
    });
  }
  if (!map.getLayer('city-icons')) {
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
        'text-color': theme.textColor,
        'text-halo-color': theme.textHaloColor,
        'text-halo-width': theme.textHaloWidth,
      },
    });
  }
}

export function RouteMap({ segments }) {
  const { t } = useTranslation();
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const loadedRef = useRef(false);
  const latestSegmentsRef = useRef(segments);
  const activeThemeRef = useRef('color');
  const [mapTheme, setMapTheme] = useState(() => {
    const stored = window.localStorage.getItem('atlas-map-theme');
    return MAP_THEMES[stored] ? stored : 'color';
  });

  useEffect(() => {
    latestSegmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    activeThemeRef.current = mapTheme;
  }, [mapTheme]);

  useEffect(() => {
    if (!mapElRef.current || !config.map.accessToken) return undefined;

    const initialTheme = MAP_THEMES[activeThemeRef.current];
    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: initialTheme.styleUrl,
      center: [-99.1332, 19.4326],
      zoom: 4,
      projection: 'mercator',
      attributionControl: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    map.doubleClickZoom.disable();

    map.on('click', (event) => {
      if (event.originalEvent?.target?.closest?.('.map-marker')) return;
      map.easeTo({ center: event.lngLat, zoom: map.getZoom() + 1, duration: 300 });
    });

    map.on('error', (event) => {
      console.error('[Mapbox error]', event.error?.message || event.error || event);
    });

    map.on('load', () => {
      map.resize();
      setupLayers(map, initialTheme);
      loadedRef.current = true;
      drawRoutes(map, markersRef, latestSegmentsRef.current, initialTheme);
    });

    const resizeObserver = new window.ResizeObserver(() => map.resize());
    resizeObserver.observe(mapElRef.current);

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    drawRoutes(map, markersRef, segments, MAP_THEMES[mapTheme]);
  }, [segments, mapTheme]);

  function selectTheme(nextTheme) {
    if (nextTheme === mapTheme) return;
    const map = mapRef.current;
    if (!map) return;

    const theme = MAP_THEMES[nextTheme];
    activeThemeRef.current = nextTheme;
    setMapTheme(nextTheme);
    window.localStorage.setItem('atlas-map-theme', nextTheme);
    loadedRef.current = false;
    map.setStyle(theme.styleUrl);
    map.once('style.load', () => {
      setupLayers(map, theme);
      loadedRef.current = true;
      drawRoutes(map, markersRef, latestSegmentsRef.current, theme);
    });
  }

  return (
    <div className="map-wrap">
      <div className="map" ref={mapElRef}>
        {!config.map.accessToken && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: 24,
              textAlign: 'center',
              color: '#64748b',
              fontSize: 13,
            }}
          >
            {t('mapConfigMissing')}
          </div>
        )}
      </div>

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
          {Object.entries(MAP_THEMES).map(([key, theme]) => {
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
                {theme.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function drawRoutes(map, markersRef, segments, theme) {
  const routeSource = map.getSource('routes');
  const cityPointsSource = map.getSource('city-points');
  if (!routeSource || !cityPointsSource) return;

  markersRef.current.forEach((marker) => marker.remove());
  markersRef.current = [];

  if (map.getLayer('countries-fill')) {
    map.setPaintProperty('countries-fill', 'fill-opacity', theme.countryFillOpacity);
  }

  const countryColor = getVisitedCountries(segments);
  const visitedCodes = Object.keys(countryColor);
  if (theme.paintVisitedCountries && map.getLayer('countries-fill') && visitedCodes.length > 0) {
    const fillExpr = ['match', ['get', 'iso_3166_1_alpha_3']];
    visitedCodes.forEach((alpha2) => {
      const alpha3 = ISO_A2_TO_A3[alpha2];
      if (!alpha3) return;
      fillExpr.push(alpha3, countryColor[alpha2]);
    });
    fillExpr.push('transparent');
    map.setPaintProperty('countries-fill', 'fill-color', fillExpr);
  } else if (map.getLayer('countries-fill')) {
    map.setPaintProperty('countries-fill', 'fill-color', 'transparent');
  }

  const features = [];
  const pairCount = {};
  segments.forEach((segment) => {
    if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
    const key = routeKey(segment.origin, segment.destination);
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
    features: cities.map((city, index) => ({
      type: 'Feature',
      properties: {
        name: city.name,
        color: colorForIndex(index),
        icon: getCityIcon(city.name) || '',
      },
      geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
    })),
  });

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
  const points = [];
  for (let index = 0; index <= steps; index++) {
    const time = index / steps;
    const remaining = 1 - time;
    points.push([
      remaining * remaining * a[0] + 2 * remaining * time * cx + time * time * b[0],
      remaining * remaining * a[1] + 2 * remaining * time * cy + time * time * b[1],
    ]);
  }
  return points;
}

function routeKey(a, b) {
  const first = `${a.lon},${a.lat}`;
  const second = `${b.lon},${b.lat}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}
