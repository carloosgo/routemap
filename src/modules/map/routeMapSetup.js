import * as maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import { config } from '../../config.js';

export const COUNTRY_BOUNDARY_SOURCE_ID = 'atlas-country-boundaries';
export const COUNTRY_FILL_LAYER_ID = 'atlas-country-fill';
export const COUNTRY_BOUNDARY_SOURCE_LAYER = 'division_area';
export const ROUTE_SOURCE_ID = 'atlas-routes';
export const ROUTE_CASING_LAYER_ID = 'atlas-routes-casing';
export const ROUTE_SOLID_LAYER_ID = 'atlas-routes-solid';
export const ROUTE_DASHED_LAYER_ID = 'atlas-routes-dashed';
export const CITY_SOURCE_ID = 'atlas-cities';
export const CITY_LAYER_ID = 'atlas-cities-layer';
export const PLACE_SOURCE_ID = 'atlas-saved-places';
export const PLACE_LAYER_ID = 'atlas-saved-places-layer';

const PMTILES_PROTOCOL_STATE = '__atlasPmtilesProtocolStateV1';

export function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

export function sourceData(map, id, data) {
  const source = map.getSource(id);
  if (source && typeof source.setData === 'function') source.setData(data);
}

export function createGeoapifyStyleUrl() {
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

export function applyBaseStyleOverrides(map) {
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

export function addCountryBoundaryLayer(map, url) {
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

export function addBaseSourcesAndLayers(map) {
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
      'circle-color': ['coalesce', ['get', 'color'], '#2563eb'],
      'circle-opacity': 0.95,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });
}
