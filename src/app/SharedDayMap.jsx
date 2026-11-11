import { useEffect, useRef, useState } from 'react';
import { config } from '../config.js';
import { loadGoogleMaps } from '../modules/map/googleMapsLoader.js';
import { decodePolyline } from '../modules/share/dayRouteShare.js';

const INK = '#0b1f2c';
const MARINA = '#0e4f63';

function lineStyle(mode) {
  if (mode === 'walk') {
    return {
      strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-0.5 0,0.5', strokeColor: '#475467', strokeOpacity: 1, strokeWeight: 4, scale: 1 }, offset: '0', repeat: '9px' }],
    };
  }
  if (mode === 'bicycle') {
    return {
      strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: '#2a7d73', strokeOpacity: 1, strokeWeight: 4, scale: 3 }, offset: '0', repeat: '14px' }],
    };
  }
  if (mode === 'transit' || mode === 'drive') {
    return { strokeColor: MARINA, strokeOpacity: 1, strokeWeight: 5, casing: true };
  }
  return {
    strokeOpacity: 0,
    icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: INK, strokeOpacity: 0.85, strokeWeight: 2.5, scale: 2 }, offset: '0', repeat: '10px' }],
  };
}

function markerElement(place) {
  const element = document.createElement('div');
  element.className = 'shared-day__marker';
  element.style.background = place.color || MARINA;
  element.textContent = String(place.number);
  return element;
}

/** Mapa de solo lectura del día compartido: paradas numeradas y sus tramos. */
export function SharedDayMap({ places, legs, unavailableLabel }) {
  const nodeRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    const overlays = [];
    if (!nodeRef.current || !places.length) return undefined;

    loadGoogleMaps()
      .then(async (maps) => {
        const [{ Map, Polyline, TransitLayer }, { AdvancedMarkerElement }, { LatLngBounds }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
          maps.importLibrary('core'),
        ]);
        if (disposed || !nodeRef.current) return;
        const map = new Map(nodeRef.current, {
          center: { lat: places[0].lat, lng: places[0].lon },
          zoom: 14,
          mapId: config.googleMaps.mapId || 'DEMO_MAP_ID',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });

        const bounds = new LatLngBounds();
        places.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lon }));

        legs.forEach((leg, index) => {
          const from = places[index];
          const to = places[index + 1];
          if (!from || !to) return;
          const decoded = decodePolyline(leg.path);
          const path = (decoded.length >= 2 ? decoded : [[from.lat, from.lon], [to.lat, to.lon]])
            .map(([lat, lng]) => ({ lat, lng }));
          path.forEach((point) => bounds.extend(point));
          // En transporte público cada parte va en el color de su línea (a pie, punteado).
          const parts = leg.mode === 'transit' && Array.isArray(leg.parts) ? leg.parts : [];
          if (parts.length) {
            parts.forEach((part) => {
              const partPath = decodePolyline(part.path).map(([lat, lng]) => ({ lat, lng }));
              if (partPath.length < 2) return;
              partPath.forEach((point) => bounds.extend(point));
              if (part.kind === 'walk') {
                overlays.push(new Polyline({ map, path: partPath, zIndex: 2, ...lineStyle('walk') }));
                return;
              }
              overlays.push(new Polyline({ map, path: partPath, strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 9, zIndex: 1 }));
              overlays.push(new Polyline({ map, path: partPath, strokeColor: part.color || MARINA, strokeOpacity: 1, strokeWeight: 5, zIndex: 2 }));
            });
            return;
          }
          const { casing, ...style } = lineStyle(leg.mode);
          if (casing) {
            overlays.push(new Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 9, zIndex: 1 }));
          }
          overlays.push(new Polyline({ map, path, zIndex: 2, ...style }));
        });

        places.forEach((place) => {
          overlays.push(new AdvancedMarkerElement({
            map,
            position: { lat: place.lat, lng: place.lon },
            content: markerElement(place),
            title: place.name,
            zIndex: 10 + place.number,
          }));
        });

        // Las líneas de transporte del mapa, como la capa de Mis rutas.
        if (TransitLayer && legs.some((leg) => leg?.mode === 'transit')) {
          const transitLayer = new TransitLayer();
          transitLayer.setMap(map);
          overlays.push(transitLayer);
        }

        if (places.length > 1) map.fitBounds(bounds, 48);
      })
      .catch((error) => {
        console.error('[Shared day] map unavailable', error);
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      overlays.forEach((overlay) => {
        if ('setMap' in overlay) overlay.setMap(null);
        else overlay.map = null;
      });
    };
  }, [places, legs]);

  return (
    <div className="shared-day__map" ref={nodeRef}>
      {failed && <p className="shared-day__map-error">{unavailableLabel}</p>}
    </div>
  );
}
