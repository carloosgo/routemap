import { isPlaced } from '../trips/tripModel.js';

export function dominantTransport(segment) {
  const transport = segment?.expenses?.transport || {};
  const candidates = [
    { type: 'plane', amount: Number(transport.plane) || 0 },
    { type: 'train', amount: Number(transport.train) || 0 },
    { type: 'bus', amount: Number(transport.bus) || 0 },
    { type: 'car', amount: Number(transport.taxiUber) || 0 },
  ];
  const top = candidates.reduce((current, candidate) =>
    candidate.amount > current.amount ? candidate : current
  );
  return top.amount > 0 ? top.type : null;
}

export function adaptiveCurve(origin, destination, steps = 80) {
  const start = [origin.lon, origin.lat];
  const end = [destination.lon, destination.lat];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 1.25 || distance > 24) return [start, end];

  const factor = Math.max(0.06, Math.min(0.2, 0.19 - Math.max(0, distance - 2) * 0.008));
  const offset = Math.min(distance * factor, 3.25);
  const middleX = (start[0] + end[0]) / 2;
  const middleY = (start[1] + end[1]) / 2;
  const length = distance || 1;
  const controlX = middleX + (dy / length) * offset;
  const controlY = middleY + (-dx / length) * offset;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const time = index / steps;
    const remaining = 1 - time;
    points.push([
      remaining * remaining * start[0] + 2 * remaining * time * controlX + time * time * end[0],
      remaining * remaining * start[1] + 2 * remaining * time * controlY + time * time * end[1],
    ]);
  }

  return points;
}

export function cityKey(city) {
  return `${Number(city.lat).toFixed(6)},${Number(city.lon).toFixed(6)}`;
}

export function orderedCities(segments) {
  const cities = [];
  const seen = new Set();
  (segments || []).forEach((segment) =>
    [segment.origin, segment.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const key = cityKey(city);
      if (seen.has(key)) return;
      seen.add(key);
      cities.push(city);
    })
  );
  return cities;
}

export function buildMapFeatureData({ segments, places, viewMode, colorForIndex }) {
  const showSegments = viewMode === 'segments';
  const showPlaces = viewMode === 'places';
  const routeFeatures = [];
  const cityFeatures = [];
  const placeFeatures = [];
  const routeCities = showSegments ? orderedCities(segments) : [];

  if (showSegments) {
    segments.forEach((segment, index) => {
      if (!isPlaced(segment.origin) || !isPlaced(segment.destination)) return;
      routeFeatures.push({
        type: 'Feature',
        properties: {
          color: colorForIndex(index),
          dashed: dominantTransport(segment) === 'plane',
        },
        geometry: {
          type: 'LineString',
          coordinates: adaptiveCurve(segment.origin, segment.destination),
        },
      });
    });
  }

  routeCities.forEach((city, index) => {
    cityFeatures.push({
      type: 'Feature',
      properties: {
        name: city.name || city.displayName || 'Ciudad',
        color: colorForIndex(index),
      },
      geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
    });
  });

  if (showPlaces) {
    places.filter(isPlaced).forEach((place) => {
      placeFeatures.push({
        type: 'Feature',
        properties: {
          id: place.id,
          name: place.name || 'Lugar',
          city: place.city || '',
          country: place.country || '',
          countryCode: place.countryCode || '',
          category: place.category || '',
          address: place.address || '',
        },
        geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      });
    });
  }

  return {
    showSegments,
    showPlaces,
    routeFeatures,
    cityFeatures,
    placeFeatures,
    routeCities,
  };
}
