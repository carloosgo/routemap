import { isPlaced } from '../trips/tripModel.js';
import { buildItineraryStopSequence } from '../trips/itineraryStopSequence.js';
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

function approximateMapDistance(left, right) {
  const leftLon = Number(left?.lon ?? left?.[0]);
  const leftLat = Number(left?.lat ?? left?.[1]);
  const rightLon = Number(right?.lon ?? right?.[0]);
  const rightLat = Number(right?.lat ?? right?.[1]);
  if (![leftLon, leftLat, rightLon, rightLat].every(Number.isFinite)) return 0;
  const meanLatitude = ((leftLat + rightLat) / 2) * (Math.PI / 180);
  const dx = (leftLon - rightLon) * Math.cos(meanLatitude);
  const dy = leftLat - rightLat;
  return Math.hypot(dx, dy);
}

function uniqueCurveReferenceCities(routeCities, origin, destination) {
  const excluded = new Set([cityKey(origin), cityKey(destination)]);
  const unique = new Map();
  (routeCities || []).forEach((city) => {
    if (!isPlaced(city)) return;
    const key = cityKey(city);
    if (!key || excluded.has(key) || unique.has(key)) return;
    unique.set(key, city);
  });
  return [...unique.values()];
}

function exteriorCurveScore(controlPoint, routeCities, origin, destination) {
  const referenceCities = uniqueCurveReferenceCities(routeCities, origin, destination);
  if (!referenceCities.length) return null;
  const total = referenceCities.reduce(
    (sum, city) => sum + approximateMapDistance(controlPoint, city),
    0
  );
  return total / referenceCities.length;
}

export function adaptiveCurve(origin, destination, stepsOrOptions = 32) {
  const options = typeof stepsOrOptions === 'object' && stepsOrOptions !== null
    ? stepsOrOptions
    : {};
  const requestedSteps = typeof stepsOrOptions === 'number'
    ? stepsOrOptions
    : Number(options.steps);
  const steps = Number.isInteger(requestedSteps) && requestedSteps >= 2
    ? requestedSteps
    : 32;
  const routeCities = Array.isArray(options.routeCities) ? options.routeCities : [];
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
  const normalX = dy / length;
  const normalY = -dx / length;
  const primaryControl = [
    middleX + (normalX * offset),
    middleY + (normalY * offset),
  ];
  const oppositeControl = [
    middleX - (normalX * offset),
    middleY - (normalY * offset),
  ];
  const primaryScore = exteriorCurveScore(
    primaryControl,
    routeCities,
    origin,
    destination
  );
  const oppositeScore = exteriorCurveScore(
    oppositeControl,
    routeCities,
    origin,
    destination
  );
  const control = primaryScore != null
    && oppositeScore != null
    && oppositeScore > primaryScore
    ? oppositeControl
    : primaryControl;
  const [controlX, controlY] = control;
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
  return Array.isArray(segments) ? segments : [];
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
  const routeOrigin = routeSegments[0]?.origin || null;
  const stopSequence = showSegments
    ? buildItineraryStopSequence(routeOrigin, routeSegments, colorForIndex)
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
          coordinates: adaptiveCurve(segment.origin, segment.destination, { routeCities }),
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
