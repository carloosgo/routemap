const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

export function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function isCountryBoundaryFeature(feature) {
  return feature?.type === 'Feature'
    && POLYGON_TYPES.has(feature?.geometry?.type)
    && Array.isArray(feature?.geometry?.coordinates);
}

function featureCountryCode(feature) {
  const properties = feature?.properties || {};
  return normalizeCountryCode(
    properties.country_code
      || properties.countryCode
      || properties.iso_3166_1_alpha_2
      || properties.iso_a2
  );
}

function featureIso3(feature) {
  const properties = feature?.properties || {};
  return String(
    properties.shapeGroup
      || properties.shapeISO
      || properties.boundaryISO
      || properties.iso_a3
      || ''
  ).trim().toUpperCase();
}

export function countryFeaturePlaceId(feature) {
  const properties = feature?.properties || {};
  return String(properties.place_id || properties.placeId || '').trim();
}

function isExplicitCountry(feature) {
  const properties = feature?.properties || {};
  const values = [
    properties.result_type,
    properties.place_type,
    properties.type,
    properties.feature_type,
  ].map((value) => String(value || '').toLowerCase());
  const name = String(properties.name || '').trim().toLowerCase();
  const country = String(properties.country || '').trim().toLowerCase();
  const rankAddress = Number(properties.rank?.address);
  const adminLevel = Number(properties.admin_level ?? properties.adminLevel);

  return values.includes('country')
    || rankAddress === 4
    || adminLevel === 2
    || Boolean(name && country && name === country);
}

function visitCoordinates(value, visitor) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
  ) {
    visitor(Number(value[0]), Number(value[1]));
    return;
  }
  value.forEach((entry) => visitCoordinates(entry, visitor));
}

function geometryEnvelopeArea(feature) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  visitCoordinates(feature?.geometry?.coordinates, (lon, lat) => {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  });

  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return 0;
  return Math.max(0, maxLon - minLon) * Math.max(0, maxLat - minLat);
}

export function selectCountryPlaceFeature(payload, expectedCountryCode) {
  const expected = normalizeCountryCode(expectedCountryCode);
  const features = Array.isArray(payload?.features) ? payload.features : [];
  if (!features.length) return null;

  return features
    .map((feature, index) => ({
      feature,
      index,
      codeMatch: expected && featureCountryCode(feature) === expected ? 1 : 0,
      explicitCountry: isExplicitCountry(feature) ? 1 : 0,
      hasPlaceId: countryFeaturePlaceId(feature) ? 1 : 0,
    }))
    .filter((item) => item.codeMatch || !expected)
    .sort((left, right) => (
      right.explicitCountry - left.explicitCountry
      || right.hasPlaceId - left.hasPlaceId
      || left.index - right.index
    ))[0]?.feature || null;
}

export function selectCountryFeature(payload, expectedCountryCode) {
  const expected = normalizeCountryCode(expectedCountryCode);
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const polygons = features.filter(isCountryBoundaryFeature);
  if (!polygons.length) return null;

  const codeMatches = expected
    ? polygons.filter((feature) => featureCountryCode(feature) === expected)
    : polygons;
  const candidates = codeMatches.length ? codeMatches : polygons;

  return candidates
    .map((feature, index) => ({
      feature,
      index,
      explicitCountry: isExplicitCountry(feature) ? 1 : 0,
      envelopeArea: geometryEnvelopeArea(feature),
    }))
    .sort((left, right) => (
      right.explicitCountry - left.explicitCountry
      || right.envelopeArea - left.envelopeArea
      || left.index - right.index
    ))[0]?.feature || null;
}

export function selectFullGeometryFeature(payload, expectedCountryCode) {
  const expected = normalizeCountryCode(expectedCountryCode);
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const polygons = features.filter(isCountryBoundaryFeature);
  if (!polygons.length) return null;

  const details = polygons.filter(
    (feature) => String(feature?.properties?.feature_type || '').toLowerCase() === 'details'
  );
  const candidates = details.length ? details : polygons;
  const codeMatches = expected
    ? candidates.filter((feature) => {
      const code = featureCountryCode(feature);
      return !code || code === expected;
    })
    : candidates;
  const finalCandidates = codeMatches.length ? codeMatches : candidates;

  return finalCandidates
    .map((feature, index) => ({
      feature,
      index,
      envelopeArea: geometryEnvelopeArea(feature),
    }))
    .sort((left, right) => (
      right.envelopeArea - left.envelopeArea
      || left.index - right.index
    ))[0]?.feature || null;
}

function polygonParts(feature) {
  if (!isCountryBoundaryFeature(feature)) return [];
  if (feature.geometry.type === 'Polygon') {
    return [feature.geometry.coordinates];
  }
  return feature.geometry.coordinates;
}

export function buildCountryLandFeature(
  payload,
  { countryCode, iso3, name = '' } = {}
) {
  const normalizedIso3 = String(iso3 || '').trim().toUpperCase();
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const polygons = features.filter(isCountryBoundaryFeature);
  if (!polygons.length) return null;

  const matching = normalizedIso3
    ? polygons.filter((feature) => {
      const code = featureIso3(feature);
      return !code || code === normalizedIso3;
    })
    : polygons;
  const candidates = matching.length ? matching : polygons;
  const parts = candidates.flatMap(polygonParts);
  if (!parts.length) return null;

  const properties = candidates[0]?.properties || {};
  const normalizedCode = normalizeCountryCode(countryCode);
  const resolvedName = String(
    name
      || properties.shapeName
      || properties.boundaryName
      || properties.name
      || normalizedIso3
      || normalizedCode
  ).trim();

  return {
    type: 'Feature',
    properties: {
      countryCode: normalizedCode,
      iso3: normalizedIso3,
      name: resolvedName,
      boundaryKind: 'land',
      source: 'geoBoundaries',
    },
    geometry: parts.length === 1
      ? { type: 'Polygon', coordinates: parts[0] }
      : { type: 'MultiPolygon', coordinates: parts },
  };
}

export function compactCountryFeature(feature, countryCode) {
  if (!isCountryBoundaryFeature(feature)) return null;
  const properties = feature.properties || {};
  const normalizedCode = normalizeCountryCode(countryCode || featureCountryCode(feature));

  return {
    type: 'Feature',
    properties: {
      countryCode: normalizedCode,
      name: properties.name || properties.country || normalizedCode,
    },
    geometry: feature.geometry,
  };
}

export function encodeCountryBoundary(feature) {
  return JSON.stringify(feature ?? null);
}

export function decodeCountryBoundary(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}

export function utf8ByteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}
