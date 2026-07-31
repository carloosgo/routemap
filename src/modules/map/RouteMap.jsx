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

const IDS = {
  countrySource: 'atlas-country-boundaries',
  countryFill: 'atlas-countries-fill',
  routeSource: 'atlas-routes',
  routeHalo: 'atlas-routes-halo',
  routeSolid: 'atlas-routes-solid',
  routeDashed: 'atlas-routes-dashed',
  routeArrows: 'atlas-routes-arrows',
  routeArrowImage: 'atlas-route-arrow',
  citySource: 'atlas-city-points',
  cityDots: 'atlas-city-dots',
  cityIcons: 'atlas-city-icons',
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

function addRouteArrowImage(map, color) {
  if (map.hasImage(IDS.routeArrowImage)) return;

  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(size, size / 2);
  context.lineTo(0, 0);
  context.lineTo(size * 0.3, size / 2);
  context.lineTo(0, size);
  context.closePath();
  context.fill();

  const image = context.getImageData(0, 0, size, size);
  map.addImage(IDS.routeArrowImage, {
    width: size,
    height: size,
    data: image.data,
  });
}

function setupLayers(map, theme) {
  if (!map.getSource(IDS.countrySource)) {
    map.addSource(IDS.countrySource, {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1',
    });
  }
  if (!map.getLayer(IDS.countryFill)) {
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
  }

  if (!map.getSource(IDS.routeSource)) {
    map.addSource(IDS.routeSource, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(IDS.routeHalo)) {
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
  }
  if (!map.getLayer(IDS.routeSolid)) {
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
  }
  if (!map.getLayer(IDS.routeDashed)) {
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
  }

  addRouteArrowImage(map, theme.arrowColor);
  if (!map.getLayer(IDS.routeArrows)) {
    map.addLayer({
      id: IDS.routeArrows,
      type: 'symbol',
      source: IDS.routeSource,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 100,
        'icon-image': IDS.routeArrowImage,
        'icon-size': 0.8,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
  }

  if (!map.getSource(IDS.citySource)) {
    map.addSource(IDS.citySource, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(IDS.cityDots)) {
    map.addLayer({
      id: IDS.cityDots,
      type: 'circle',
      source: IDS.citySource,
      paint: {
        'circle-radius': theme.pointRadius,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': theme.pointStrokeWidth,
        'circle-stroke-color': theme.pointStrokeColor,
      },
    });
  }
  if (!map.getLayer(IDS.cityIcons)) {
    map.addLayer({
      id: IDS.cityIcons,
      type: 'symbol',
      source: IDS.citySource,
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

function applyThemePaint(map, theme) {
  if (map.getLayer(IDS.countryFill)) {
    map.setPaintProperty(IDS.countryFill, 'fill-opacity', theme.countryFillOpacity);
  }
  if (map.getLayer(IDS.routeHalo)) {
    map.setPaintProperty(IDS.routeHalo, 'line-color', theme.routeHaloColor);
    map.setPaintProperty(IDS.routeHalo, 'line-width', theme.routeHaloWidth);
    map.setPaintProperty(IDS.routeHalo, 'line-opacity', theme.routeHaloOpacity);
  }
  [IDS.routeSolid, IDS.routeDashed].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-width', theme.routeWidth);
  });
  if (map.getLayer(IDS.cityDots)) {
    map.setPaintProperty(IDS.cityDots, 'circle-radius', theme.pointRadius);
    map.setPaintProperty(IDS.cityDots, 'circle-stroke-width', theme.pointStrokeWidth);
    map.setPaintProperty(IDS.cityDots, 'circle-stroke-color', theme.pointStrokeColor);
  }
  if (map.getLayer(IDS.cityIcons)) {
    map.setPaintProperty(IDS.cityIcons, 'text-color', theme.textColor);
    map.setPaintProperty(IDS.cityIcons, 'text-halo-color', theme.textHaloColor);
    map.setPaintProperty(IDS.cityIcons, 'text-halo-width', theme.textHaloWidth);
  }
}

export function RouteMap({ segments }) {
  const { t } = useTranslation();
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const latestSegmentsRef = useRef(segments);
  const initialThemeKeyRef = useRef(null);
  const activeThemeRef = useRef(null);

  if (initialThemeKeyRef.current === null) {
    const stored = window.localStorage.getItem('atlas-map-theme');
    initialThemeKeyRef.current = MAP_THEMES[stored] ? stored : 'color';
    activeThemeRef.current = initialThemeKeyRef.current;
  }

  const [mapTheme, setMapTheme] = useState(initialThemeKeyRef.current);

  useEffect(() => {
    latestSegmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (!mapElRef.current || !config.map.accessToken) return undefined;

    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: MAP_THEMES[activeThemeRef.current].styleUrl,
      center: [-99.1332, 19.4326],
      zoom: 4,
      projection: 'mercator',
      attributionControl: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    map.doubleClickZoom.disable();

    const rebuildAtlasLayers = () => {
      const theme = MAP_THEMES[activeThemeRef.current];
      try {
        setupLayers(map, theme);
        applyThemePaint(map, theme);
        loadedRef.current = true;
        drawRoutes(map, latestSegmentsRef.current, theme);
        map.resize();
      } catch (error) {
        loadedRef.current = false;
        console.error('[Atlas map layers]', error);
      }
    };

    map.on('style.load', rebuildAtlasLayers);

    map.on('click', (event) => {
      if (event.originalEvent?.target?.closest?.('.map-marker')) return;
      map.easeTo({ center: event.lngLat, zoom: map.getZoom() + 1, duration: 300 });
    });

    map.on('error', (event) => {
      console.error('[Mapbox error]', event.error?.message || event.error || event);
    });

    const resizeObserver = new window.ResizeObserver(() => map.resize());
    resizeObserver.observe(mapElRef.current);

    return () => {
      resizeObserver.disconnect();
      map.off('style.load', rebuildAtlasLayers);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    drawRoutes(map, segments, MAP_THEMES[mapTheme]);
  }, [segments, mapTheme]);

  function selectTheme(nextTheme) {
    if (!MAP_THEMES[nextTheme] || nextTheme === activeThemeRef.current) return;
    const map = mapRef.current;
    if (!map) return;

    activeThemeRef.current = nextTheme;
    loadedRef.current = false;
    setMapTheme(nextTheme);
    window.localStorage.setItem('atlas-map-theme', nextTheme);
    map.setStyle(MAP_THEMES[nextTheme].styleUrl, { diff: false });
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

function drawRoutes(map, segments, theme) {
  const routeSource = map.getSource(IDS.routeSource);
  const cityPointsSource = map.getSource(IDS.citySource);
  if (!routeSource || !cityPointsSource) return;

  const countryColor = getVisitedCountries(segments);
  const visitedCodes = Object.keys(countryColor);

  if (theme.paintVisitedCountries && map.getLayer(IDS.countryFill) && visitedCodes.length > 0) {
    const fillExpression = ['match', ['get', 'iso_3166_1_alpha_3']];
    visitedCodes.forEach((alpha2) => {
      const alpha3 = ISO_A2_TO_A3[alpha2];
      if (alpha3) fillExpression.push(alpha3, countryColor[alpha2]);
    });
    fillExpression.push('transparent');
    map.setPaintProperty(IDS.countryFill, 'fill-color', fillExpression);
  } else if (map.getLayer(IDS.countryFill)) {
    map.setPaintProperty(IDS.countryFill, 'fill-color', 'transparent');
  }

  const routeFeatures = [];
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
    const offset = (pairCount[key] || 1) > 1
      ? (pairIndex[key] % 2 === 0 ? 5 : -5)
      : 0;
    pairIndex[key] += 1;

    routeFeatures.push({
      type: 'Feature',
      properties: { color, isDashed, offset, transport, index },
      geometry: {
        type: 'LineString',
        coordinates: adaptiveCurve(
          [segment.origin.lon, segment.origin.lat],
          [segment.destination.lon, segment.destination.lat]
        ),
      },
    });
  });

  routeSource.setData({ type: 'FeatureCollection', features: routeFeatures });

  const cities = [];
  const cityKeys = new Set();
  segments.forEach((segment) => {
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const key = `${city.lon},${city.lat}`;
      if (cityKeys.has(key)) return;
      cityKeys.add(key);
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
      geometry: {
        type: 'Point',
        coordinates: [city.lon, city.lat],
      },
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
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curveFactor = Math.max(0, Math.min(0.22, 0.22 - (distance - 1) * 0.04));
  const offset = distance * curveFactor;
  const midpointX = (a[0] + b[0]) / 2;
  const midpointY = (a[1] + b[1]) / 2;
  const length = distance || 1;
  const controlX = midpointX + (-dy / length) * offset;
  const controlY = midpointY + (dx / length) * offset;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const time = index / steps;
    const remaining = 1 - time;
    points.push([
      remaining * remaining * a[0] + 2 * remaining * time * controlX + time * time * b[0],
      remaining * remaining * a[1] + 2 * remaining * time * controlY + time * time * b[1],
    ]);
  }

  return points;
}

function routeKey(a, b) {
  const first = `${a.lon},${a.lat}`;
  const second = `${b.lon},${b.lat}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}
