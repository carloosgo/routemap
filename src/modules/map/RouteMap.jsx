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
  viewMode = 'segments',
  focusDay,
  selectedPlaceId = '',
  onSelectPlace,
  focusLabel = '',
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
      viewMode={viewMode}
      planningSegments={segments}
      focusDay={focusDay}
      selectedPlaceId={selectedPlaceId}
      onSelectPlace={onSelectPlace}
      focusLabel={focusLabel}
    />
  );
}
