import { isPlaced } from '../trips/tripModel.js';
import { buildItineraryStopSequence } from '../trips/itineraryStopSequence.js';
import { syncSegmentOrigins } from '../trips/tripOperations.js';
import { normalizeRouteGeometry } from '../routes/routeModel.js';
import { savedPlaceMarkerStyle } from './savedPlaceMarkerPalette.js';

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

export function adaptiveCurve(origin, destination, steps = 32) {
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

export function canonicalSegmentChain(segments) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  return syncSegmentOrigins(safeSegments, safeSegments[0]?.origin || null);
}

export function orderedCities(segments) {
  const cities = [];
  canonicalSegmentChain(segments).forEach((segment, index) => {
    if (index === 0 && isPlaced(segment?.origin)) {
      cities.push(segment.origin);
    }
    if (!isPlaced(segment?.destination)) return;
    const previous = cities.at(-1);
    if (previous && cityKey(previous) === cityKey(segment.destination)) return;
    cities.push(segment.destination);
  });
  return cities;
}

export function itineraryViewportKey(segments) {
  const keys = orderedCities(segments).map(cityKey).filter(Boolean);
  return [...new Set(keys)].sort().join('|');
}

function normalizedCountryName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function placeCountryKey(place) {
  const countryCode = String(place?.countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(countryCode)) return `code:${countryCode}`;
  const country = normalizedCountryName(place?.country);
  return country ? `name:${country}` : 'unknown';
}

function placeCountryStyleMap(places) {
  const countryKeys = [
    ...new Set((places || []).filter(isPlaced).map((place) => placeCountryKey(place))),
  ].sort();
  return new Map(
    countryKeys.map((countryKey, index) => [countryKey, savedPlaceMarkerStyle(index)])
  );
}

function cityPointFeature(city, role = 'destination') {
  return {
    type: 'Feature',
    properties: {
      name: city.name || city.displayName || 'Ciudad',
      role,
      sequence: null,
      color: null,
      visits: [],
      isFinish: false,
    },
    geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
  };
}

export function savedPlaceRouteFeatures(routeConnections) {
  return (routeConnections || []).flatMap((route) => {
    if (route?.visible === false) return [];
    const geometry = normalizeRouteGeometry(route?.geometry);
    if (!geometry) return [];
    return [{
      type: 'Feature',
      properties: {
        id: route.id || '',
        mode: route.mode || '',
      },
      geometry,
    }];
  });
}

export function buildMapFeatureData({
  segments,
  places,
  routeConnections = [],
  viewMode,
  colorForIndex,
}) {
  const showSegments = viewMode === 'segments';
  const showPlaces = viewMode === 'places';
  const routeFeatures = [];
  const cityFeatures = [];
  const placeFeatures = [];
  const placeRouteFeatures = showPlaces
    ? savedPlaceRouteFeatures(routeConnections)
    : [];
  const routeSegments = showSegments ? canonicalSegmentChain(segments) : [];
  const routeCities = showSegments ? orderedCities(routeSegments) : [];
  const stopSequence = showSegments
    ? buildItineraryStopSequence(routeSegments, colorForIndex)
    : [];
  const countryStyles = showPlaces ? placeCountryStyleMap(places) : new Map();

  if (showSegments) {
    routeSegments.forEach((segment, index) => {
      if (!isPlaced(segment?.origin) || !isPlaced(segment?.destination)) return;
      const stop = stopSequence[index];
      routeFeatures.push({
        type: 'Feature',
        properties: {
          segmentId: segment.id || '',
          sequence: stop?.number ?? null,
          color: stop?.color || colorForIndex(index),
          dashed: dominantTransport(segment) === 'plane',
        },
        geometry: {
          type: 'LineString',
          coordinates: adaptiveCurve(segment.origin, segment.destination),
        },
      });
    });

    const featuresByCityKey = new Map();
    const origin = routeSegments[0]?.origin;
    if (isPlaced(origin)) {
      const originFeature = cityPointFeature(origin, 'origin');
      cityFeatures.push(originFeature);
      featuresByCityKey.set(cityKey(origin), originFeature);
    }

    let lastPlacedDestinationIndex = -1;
    routeSegments.forEach((segment, index) => {
      if (isPlaced(segment?.destination)) lastPlacedDestinationIndex = index;
    });

    routeSegments.forEach((segment, index) => {
      const destination = segment?.destination;
      if (!isPlaced(destination)) return;
      const destinationKey = cityKey(destination);
      const stop = stopSequence[index];
      let feature = featuresByCityKey.get(destinationKey);

      if (!feature) {
        feature = cityPointFeature(destination);
        featuresByCityKey.set(destinationKey, feature);
        cityFeatures.push(feature);
      }

      if (stop?.number != null) {
        const visit = {
          sequence: stop.number,
          color: stop.color || colorForIndex(index),
        };
        feature.properties.visits.push(visit);
        if (feature.properties.sequence == null) {
          feature.properties.sequence = visit.sequence;
          feature.properties.color = visit.color;
        }
      }

      if (index === lastPlacedDestinationIndex) {
        feature.properties.isFinish = true;
      }
    });
  }

  if (showPlaces) {
    places.filter(isPlaced).forEach((place) => {
      const countryKey = placeCountryKey(place);
      const markerStyle = countryStyles.get(countryKey) || savedPlaceMarkerStyle(0);
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
          countryKey,
          color: markerStyle.color,
          iconId: markerStyle.iconId,
        },
        geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      });
    });
  }

  return {
    showSegments,
    showPlaces,
    routeFeatures,
    placeRouteFeatures,
    cityFeatures,
    placeFeatures,
    routeCities,
  };
}
