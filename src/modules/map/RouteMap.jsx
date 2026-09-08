import { useMemo } from 'react';
import { GooglePlacesMap } from './GooglePlacesMap.jsx';
import { itineraryMapProjectionSignature } from './itineraryMapProjection.js';
import './RouteMap.css';
import './GooglePlacesMap.css';
import './ItineraryNumberMarkers.css';

export function RouteMap({
  origin,
  segments,
  places = [],
  routeConnections = [],
  addPlace,
  addCity,
  viewMode = 'segments',
  showCityTrace = viewMode === 'segments',
  showSavedPlaces = viewMode === 'places',
}) {
  const mapSegmentsSignature = useMemo(
    () => itineraryMapProjectionSignature(origin, segments),
    [origin, segments]
  );
  const mapSegments = useMemo(
    () => JSON.parse(mapSegmentsSignature),
    [mapSegmentsSignature]
  );

  return (
    <GooglePlacesMap
      segments={mapSegments}
      places={places}
      routeConnections={routeConnections}
      addPlace={addPlace}
      addCity={addCity}
      viewMode={viewMode}
      showCityTrace={showCityTrace}
      showSavedRoutes={showSavedPlaces}
    />
  );
}
