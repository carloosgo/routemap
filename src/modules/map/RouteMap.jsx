import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { config, colorForIndex } from '../../config.js';
import { isPlaced } from '../trips/tripModel.js';
import { searchGeoapifyPlaces } from '../places/geoapifyClient.js';
import './RouteMap.css';

function dominantTransport(segment) {
  const transport = segment?.expenses?.transport || {};
  const candidates = [
    { type: 'plane', amount: Number(transport.plane) || 0 },
    { type: 'train', amount: Number(transport.train) || 0 },
    { type: 'bus', amount: Number(transport.bus) || 0 },
    { type: 'car', amount: Number(transport.taxiUber) || 0 },
  ];
  const top = candidates.reduce((current, candidate) => (
    candidate.amount > current.amount ? candidate : current
  ));
  return top.amount > 0 ? top.type : null;
}

function adaptiveCurve(origin, destination, steps = 80) {
  const start = [origin.lon, origin.lat];
  const end = [destination.lon, destination.lat];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curveFactor = Math.max(0, Math.min(0.22, 0.22 - (distance - 1) * 0.04));
  const offset = distance * curveFactor;
  const middleX = (start[0] + end[0]) / 2;
  const middleY = (start[1] + end[1]) / 2;
  const length = distance || 1;
  const controlX = middleX + (-dy / length) * offset;
  const controlY = middleY + (dx / length) * offset;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const time = index / steps;
    const remaining = 1 - time;
    const lon = remaining * remaining * start[0]
      + 2 * remaining * time * controlX
      + time * time * end[0];
    const lat = remaining * remaining * start[1]
      + 2 * remaining * time * controlY
      + time * time * end[1];
    points.push([lat, lon]);
  }

  return points;
}

function cityKey(city) {
  return `${Number(city.lat).toFixed(6)},${Number(city.lon).toFixed(6)}`;
}

export function RouteMap({ segments, updateSegment }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const routeLayersRef = useRef(L.layerGroup());
  const resultLayersRef = useRef(L.layerGroup());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState(segments[0]?.id || '');
  const abortRef = useRef(null);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) || segments[0],
    [segments, selectedSegmentId]
  );

  useEffect(() => {
    if (!segments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(segments[0]?.id || '');
    }
  }, [segments, selectedSegmentId]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !config.geoapify.mapApiKey) return undefined;

    const map = L.map(mapNode.current, { zoomControl: true })
      .setView(config.map.initialCenter, config.map.initialZoom);

    L.tileLayer(
      `https://maps.geoapify.com/v1/tile/${config.geoapify.mapStyle}/{z}/{x}/{y}.png?apiKey=${config.geoapify.mapApiKey}`,
      { maxZoom: 20, attribution: '© OpenStreetMap contributors · Powered by Geoapify' }
    ).addTo(map);

    routeLayersRef.current.addTo(map);
    resultLayersRef.current.addTo(map);
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

    routeLayersRef.current.clearLayers();
    const bounds = [];
    const cityColors = new Map();

    segments.forEach((segment, index) => {
      const color = colorForIndex(index);
      [segment.origin, segment.destination].forEach((city) => {
        if (!isPlaced(city)) return;
        const key = cityKey(city);
        if (!cityColors.has(key)) cityColors.set(key, { city, color });
      });

      if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;

      const curve = adaptiveCurve(segment.origin, segment.destination);
      const dashed = dominantTransport(segment) === 'plane';

      L.polyline(curve, {
        color: '#ffffff',
        weight: 5,
        opacity: 0.9,
        interactive: false,
      }).addTo(routeLayersRef.current);

      L.polyline(curve, {
        color,
        weight: 2,
        opacity: 0.95,
        dashArray: dashed ? '10 8' : null,
        lineCap: dashed ? 'butt' : 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(routeLayersRef.current);
    });

    cityColors.forEach(({ city, color }) => {
      bounds.push([city.lat, city.lon]);
      L.circleMarker([city.lat, city.lon], {
        radius: 7,
        color: '#ffffff',
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
        pane: 'markerPane',
      })
        .bindTooltip(city.name || city.displayName || 'Ciudad', {
          direction: 'top',
          offset: [0, -7],
        })
        .addTo(routeLayersRef.current);
    });

    segments.forEach((segment) => {
      (segment.places || []).forEach((place) => {
        if (!isPlaced(place)) return;
        bounds.push([place.lat, place.lon]);
        L.marker([place.lat, place.lon])
          .bindPopup(`<strong>${place.name}</strong>${place.address ? `<br>${place.address}` : ''}`)
          .addTo(routeLayersRef.current);
      });
    });

    if (bounds.length === 1) map.setView(bounds[0], 10);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [70, 70], maxZoom: 10 });
  }, [segments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    resultLayersRef.current.clearLayers();
    results.forEach((place) => {
      if (!isPlaced(place)) return;
      L.circleMarker([place.lat, place.lon], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#0d6078',
        fillOpacity: 0.95,
      })
        .bindPopup(`<strong>${place.name}</strong>${place.address ? `<br>${place.address}` : ''}`)
        .addTo(resultLayersRef.current);
    });
  }, [results]);

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
        if (searchError.name !== 'AbortError') {
          setError(searchError.message || 'No fue posible buscar lugares.');
        }
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

  return (
    <div className="geo-map-wrap">
      <div className="geo-map" ref={mapNode}>
        {!config.geoapify.mapApiKey && (
          <div className="geo-map__missing">Falta VITE_GEOAPIFY_MAPS_API_KEY.</div>
        )}
      </div>

      <div className="geo-search">
        <div className="geo-search__row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar hotel, restaurante, estación…"
            aria-label="Buscar lugares"
          />
          <select
            value={selectedSegment?.id || ''}
            onChange={(event) => setSelectedSegmentId(event.target.value)}
            aria-label="Tramo donde guardar"
          >
            {segments.map((segment, index) => (
              <option key={segment.id} value={segment.id}>Tramo {index + 1}</option>
            ))}
          </select>
        </div>
        {searching && <div className="geo-search__status">Buscando…</div>}
        {error && <div className="geo-search__error">{error}</div>}
        {results.length > 0 && (
          <div className="geo-search__results">
            {results.map((place) => (
              <div className="geo-search__result" key={place.id}>
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.address || place.formatted}</small>
                </span>
                <button type="button" onClick={() => savePlace(place)}>Guardar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
