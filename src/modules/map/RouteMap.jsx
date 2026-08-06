import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config, colorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { countryFillStyleState } from './countryColoring.js';
import { resolveOvertureDivisionsPmtilesUrl } from './overtureCountrySource.js';
import { installSavedPlaceSymbolLayer } from './savedPlaceSymbol.js';
import { PlaceSearchForm } from './PlaceSearchForm.jsx';
import { savedPlacePopup } from './placeMapDom.js';
import {
  buildMapFeatureData,
  cityKey,
} from './routeMapModel.js';
import {
  CITY_LAYER_ID,
  CITY_SOURCE_ID,
  COUNTRY_FILL_LAYER_ID,
  PLACE_LAYER_ID,
  PLACE_ROUTE_SOURCE_ID,
  PLACE_SOURCE_ID,
  ROUTE_SOURCE_ID,
  addBaseSourcesAndLayers,
  addCountryBoundaryLayer,
  applyBaseStyleOverrides,
  createGeoapifyStyleUrl,
  sourceData,
} from './routeMapSetup.js';
import { usePlaceResultMarkers } from './usePlaceResultMarkers.js';
import { usePlaceSearch } from './usePlaceSearch.js';
import './RouteMap.css';

export function RouteMap({
  segments,
  places = [],
  routeConnections = [],
  addPlace,
  viewMode = 'segments',
}) {
  const { t } = useTranslation();
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const lastRouteViewportKeyRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [countryLayerReady, setCountryLayerReady] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  const placeSearch = usePlaceSearch({ viewMode });

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !config.geoapify.mapApiKey) return undefined;
    let disposed = false;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: createGeoapifyStyleUrl(),
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
        .setText(feature.properties?.name || t('city'))
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
        .setDOMContent(savedPlacePopup(feature.properties, t))
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
      cityPopup.remove();
      setCountryLayerReady(false);
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [t]);

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

    const {
      showSegments,
      routeFeatures,
      placeRouteFeatures,
      cityFeatures,
      placeFeatures,
      routeCities,
    } = buildMapFeatureData({
      segments,
      places,
      routeConnections,
      viewMode,
      colorForIndex,
    });
    const routeBounds = new maplibregl.LngLatBounds();
    routeCities.forEach((city) => routeBounds.extend([city.lon, city.lat]));

    sourceData(map, ROUTE_SOURCE_ID, { type: 'FeatureCollection', features: routeFeatures });
    sourceData(map, PLACE_ROUTE_SOURCE_ID, {
      type: 'FeatureCollection',
      features: placeRouteFeatures,
    });
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
  }, [segments, places, routeConnections, viewMode, mapReady]);

  usePlaceResultMarkers({
    mapRef,
    mapReady,
    viewMode,
    results: placeSearch.results,
    places,
    addPlace,
    setSaveNotice,
  });

  return (
    <div className="geo-map-wrap">
      <div className="geo-map" ref={mapNode}>
        {!config.geoapify.mapApiKey && (
          <div className="geo-map__missing">{t('mapConfigMissingShort')}</div>
        )}
      </div>
      {viewMode === 'places' && (
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
      {viewMode === 'places' && saveNotice && (
        <div className="toast" role="status" aria-live="polite">
          {saveNotice}
        </div>
      )}
    </div>
  );
}
