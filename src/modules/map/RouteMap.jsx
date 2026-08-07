import { GooglePlacesMap } from './GooglePlacesMap.jsx';
import { ItineraryRouteMap } from './ItineraryRouteMap.jsx';
import './RouteMap.css';

export function RouteMap({
  segments,
  places = [],
  routeConnections = [],
  addPlace,
  viewMode = 'segments',
}) {
  if (viewMode === 'places') {
    return (
      <GooglePlacesMap
        places={places}
        routeConnections={routeConnections}
        addPlace={addPlace}
      />
    );
  }

  return <ItineraryRouteMap segments={segments} />;
}
