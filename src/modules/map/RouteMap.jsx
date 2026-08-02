import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { config, colorForIndex } from '../../config.js';
import { isPlaced } from '../trips/tripModel.js';
import { requestGeoapifyRoute, searchGeoapifyPlaces } from '../places/geoapifyClient.js';
import './RouteMap.css';

function routeSignature(segment, mode = segment.routeMode || 'drive') {
  if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return '';
  return `${segment.origin.lat.toFixed(6)},${segment.origin.lon.toFixed(6)}|${segment.destination.lat.toFixed(6)},${segment.destination.lon.toFixed(6)}|${mode}`;
}

function pointsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat().map(([lon, lat]) => [lat, lon]);
  return [];
}

export function RouteMap({ segments, updateSegment }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(L.layerGroup());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState(segments[0]?.id || '');
  const [routingId, setRoutingId] = useState('');
  const abortRef = useRef(null);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) || segments[0],
    [segments, selectedSegmentId]
  );

  useEffect(() => {
    if (!selectedSegmentId && segments[0]) setSelectedSegmentId(segments[0].id);
  }, [segments, selectedSegmentId]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !config.geoapify.mapApiKey) return undefined;
    const map = L.map(mapNode.current, { zoomControl: true }).setView(config.map.initialCenter, config.map.initialZoom);
    L.tileLayer(
      `https://maps.geoapify.com/v1/tile/${config.geoapify.mapStyle}/{z}/{x}/{y}.png?apiKey=${config.geoapify.mapApiKey}`,
      { maxZoom: 20, attribution: '© OpenStreetMap contributors · Powered by Geoapify' }
    ).addTo(map);
    layersRef.current.addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapNode.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.clearLayers();
    const bounds = [];

    segments.forEach((segment, index) => {
      const color = colorForIndex(index);
      [segment.origin, segment.destination].forEach((city) => {
        if (!isPlaced(city)) return;
        bounds.push([city.lat, city.lon]);
        L.circleMarker([city.lat, city.lon], { radius: 6, color, weight: 3, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(city.name || city.displayName || 'Ciudad')
          .addTo(layersRef.current);
      });

      const storedPoints = pointsFromGeometry(segment.route?.geometry);
      if (storedPoints.length) {
        L.polyline(storedPoints, { color, weight: 4, opacity: 0.85 }).addTo(layersRef.current);
        storedPoints.forEach((point) => bounds.push(point));
      } else if (isPlaced(segment.origin) && isPlaced(segment.destination)) {
        L.polyline([[segment.origin.lat, segment.origin.lon], [segment.destination.lat, segment.destination.lon]], {
          color, weight: 2, opacity: 0.6, dashArray: '7 7',
        }).addTo(layersRef.current);
      }

      (segment.places || []).forEach((place) => {
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
        bounds.push([place.lat, place.lon]);
        L.marker([place.lat, place.lon])
          .bindPopup(`<strong>${place.name}</strong>${place.address ? `<br>${place.address}` : ''}`)
          .addTo(layersRef.current);
      });
    });

    results.forEach((place) => {
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
      bounds.push([place.lat, place.lon]);
      L.circleMarker([place.lat, place.lon], { radius: 7, color: '#0d6078', fillColor: '#0d6078', fillOpacity: 0.9 })
        .bindPopup(`<strong>${place.name}</strong>${place.address ? `<br>${place.address}` : ''}`)
        .addTo(layersRef.current);
    });

    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
  }, [segments, results]);

  useEffect(() => {
    abortRef.current?.abort();
    const text = query.trim();
    if (text.length < config.geoapify.searchMinChars) {
      setResults([]);
      setSearching(false);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        setResults(await searchGeoapifyPlaces(text, { signal: controller.signal }));
      } catch (searchError) {
        if (searchError.name !== 'AbortError') setError(searchError.message || 'No fue posible buscar lugares.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, config.geoapify.searchDebounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function savePlace(place) {
    if (!selectedSegment) return;
    const saved = {
      id: place.id,
      name: place.name,
      address: place.address || place.formatted || '',
      category: place.category || '',
      countryCode: place.countryCode || '',
      lat: Number(place.lat),
      lon: Number(place.lon),
      savedAt: new Date().toISOString(),
    };
    const current = selectedSegment.places || [];
    if (current.some((item) => item.id === saved.id)) return;
    updateSegment(selectedSegment.id, { places: [...current, saved] });
  }

  async function traceRoute(segment) {
    const signature = routeSignature(segment);
    if (!signature) return;
    if (segment.route?.signature === signature && segment.route?.geometry) return;
    setRoutingId(segment.id);
    setError('');
    try {
      const route = await requestGeoapifyRoute({
        origin: segment.origin,
        destination: segment.destination,
        mode: segment.routeMode || 'drive',
      });
      updateSegment(segment.id, { route });
    } catch (routeError) {
      setError(routeError.message || 'No fue posible trazar la ruta.');
    } finally {
      setRoutingId('');
    }
  }

  return (
    <div className="geo-map-wrap">
      <div className="geo-map" ref={mapNode}>
        {!config.geoapify.mapApiKey && <div className="geo-map__missing">Falta VITE_GEOAPIFY_MAPS_API_KEY.</div>}
      </div>

      <div className="geo-search">
        <div className="geo-search__row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar hotel, restaurante, museo…" aria-label="Buscar lugares" />
          <select value={selectedSegment?.id || ''} onChange={(event) => setSelectedSegmentId(event.target.value)} aria-label="Tramo donde guardar">
            {segments.map((segment, index) => <option key={segment.id} value={segment.id}>Tramo {index + 1}</option>)}
          </select>
        </div>
        {searching && <div className="geo-search__status">Buscando…</div>}
        {error && <div className="geo-search__error">{error}</div>}
        {results.length > 0 && (
          <div className="geo-search__results">
            {results.map((place) => (
              <div className="geo-search__result" key={place.id}>
                <span><strong>{place.name}</strong><small>{place.address || place.formatted}</small></span>
                <button type="button" onClick={() => savePlace(place)}>Guardar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="geo-routes">
        {segments.filter((segment) => isPlaced(segment.origin) && isPlaced(segment.destination)).map((segment, index) => {
          const validStored = segment.route?.signature === routeSignature(segment) && segment.route?.geometry;
          return (
            <div key={segment.id} className="geo-routes__item">
              <select value={segment.routeMode || 'drive'} onChange={(event) => updateSegment(segment.id, { routeMode: event.target.value, route: null })}>
                <option value="drive">Auto</option><option value="walk">Caminar</option><option value="bicycle">Bicicleta</option><option value="transit">Transporte</option>
              </select>
              <button type="button" disabled={routingId === segment.id || validStored} onClick={() => traceRoute(segment)}>
                {routingId === segment.id ? 'Trazando…' : validStored ? `Ruta ${index + 1} guardada` : `Trazar ruta ${index + 1}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
