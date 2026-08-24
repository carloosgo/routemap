import { useMemo } from 'react';
import { GooglePlacesMap } from './GooglePlacesMap.jsx';
import { itineraryMapProjectionSignature } from './itineraryMapProjection.js';
import './RouteMap.css';
import './GooglePlacesMap.css';
import './ItineraryNumberMarkers.css';

export function RouteMap({
  segments,
  places = [],
  routeConnections = [],
  addPlace,
  viewMode = 'segments',
}) {
  const mapSegmentsSignature = useMemo(
    () => itineraryMapProjectionSignature(segments),
    [segments]
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
      viewMode={viewMode}
    />
  );
}
