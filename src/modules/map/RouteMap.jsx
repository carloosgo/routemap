import { useEffect, useState } from 'react';
import { GooglePlacesMap } from './GooglePlacesMap.jsx';
import { ItineraryRouteMap } from './ItineraryRouteMap.jsx';
import './RouteMap.css';
import './GooglePlacesMap.css';

export function RouteMap({
  segments,
  places = [],
  routeConnections = [],
  addPlace,
  viewMode = 'segments',
}) {
  const [placesMapMounted, setPlacesMapMounted] = useState(viewMode === 'places');

  useEffect(() => {
    if (viewMode === 'places') setPlacesMapMounted(true);
  }, [viewMode]);

  return (
    <div className="route-map-stack">
      <div
        className={`route-map-layer${viewMode === 'segments' ? ' is-active' : ''}`}
        aria-hidden={viewMode !== 'segments'}
      >
        <ItineraryRouteMap segments={segments} />
      </div>
      {placesMapMounted && (
        <div
          className={`route-map-layer${viewMode === 'places' ? ' is-active' : ''}`}
          aria-hidden={viewMode !== 'places'}
        >
          <GooglePlacesMap
            places={places}
            routeConnections={routeConnections}
            addPlace={addPlace}
            active={viewMode === 'places'}
          />
        </div>
      )}
    </div>
  );
}
