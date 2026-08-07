import { GooglePlacesMap } from './GooglePlacesMap.jsx';
import './RouteMap.css';
import './GooglePlacesMap.css';

export function RouteMap({
  segments,
  places = [],
  routeConnections = [],
  addPlace,
  viewMode = 'segments',
}) {
  return (
    <GooglePlacesMap
      segments={segments}
      places={places}
      routeConnections={routeConnections}
      addPlace={addPlace}
      viewMode={viewMode}
    />
  );
}
