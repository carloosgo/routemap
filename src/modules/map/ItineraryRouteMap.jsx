import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config, colorForIndex } from '../../config.js';
import { useTranslation } from '../../i18n/index.jsx';
import { countryFillStyleState } from './countryColoring.js';
import { resolveOvertureDivisionsPmtilesUrl } from './overtureCountrySource.js';
import { buildMapFeatureData, cityKey } from './routeMapModel.js';
import {
  CITY_LAYER_ID,
  CITY_SOURCE_ID,
  COUNTRY_FILL_LAYER_ID,
  ROUTE_SOURCE_ID,
  addBaseSourcesAndLayers,
  addCountryBoundaryLayer,
  applyBaseStyleOverrides,
  createGeoapifyStyleUrl,
  sourceData,
} from './routeMapSetup.js';

export function ItineraryRouteMap({ segments }) {
  const { t } = useTranslation();
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const lastRouteViewportKeyRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [countryLayerReady, setCountryLayerReady] = useState(false);

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
    const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const clearPointer = () => { map.getCanvas().style.cursor = ''; };
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

    map.on('load', () => {
      applyBaseStyleOverrides(map);
      addBaseSourcesAndLayers(map);
      map.on('mouseenter', CITY_LAYER_ID, showCityPopup);
      map.on('mouseleave', CITY_LAYER_ID, clearHover);
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
    const { filter, colorExpression } = countryFillStyleState(segments, colorForIndex);
    map.setFilter(COUNTRY_FILL_LAYER_ID, filter);
    map.setPaintProperty(COUNTRY_FILL_LAYER_ID, 'fill-color', colorExpression);
  }, [segments, mapReady, countryLayerReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const { routeFeatures, cityFeatures, routeCities } = buildMapFeatureData({
      segments,
      places: [],
      routeConnections: [],
      viewMode: 'segments',
      colorForIndex,
    });
    const routeBounds = new maplibregl.LngLatBounds();
    routeCities.forEach((city) => routeBounds.extend([city.lon, city.lat]));
    sourceData(map, ROUTE_SOURCE_ID, { type: 'FeatureCollection', features: routeFeatures });
    sourceData(map, CITY_SOURCE_ID, { type: 'FeatureCollection', features: cityFeatures });

    const routeViewportKey = routeCities.map(cityKey).join('|');
    if (routeViewportKey !== lastRouteViewportKeyRef.current) {
      lastRouteViewportKeyRef.current = routeViewportKey;
      if (routeCities.length === 1) {
        map.easeTo({ center: routeBounds.getCenter(), zoom: 10, duration: 0 });
      } else if (routeCities.length > 1) {
        map.fitBounds(routeBounds, { padding: 84, maxZoom: 10, duration: 0 });
      }
    }
  }, [segments, mapReady]);

  return (
    <div className="geo-map-wrap">
      <div className="geo-map" ref={mapNode}>
        {!config.geoapify.mapApiKey && (
          <div className="geo-map__missing">{t('mapConfigMissingShort')}</div>
        )}
      </div>
    </div>
  );
}
