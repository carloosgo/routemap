function normalizedName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(left, right) {
  const a = normalizedName(left);
  const b = normalizedName(right);
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);
  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    for (let column = 0; column <= b.length; column += 1) {
      previous[column] = current[column];
    }
  }
  return previous[b.length];
}

function nameSimilarity(left, right) {
  const a = normalizedName(left);
  const b = normalizedName(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - (levenshtein(a, b) / longest) : 0;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (!values.every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const [aLat, aLon, bLat, bLon] = values;
  const earthRadius = 6_371_000;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const first = toRadians(aLat);
  const second = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(first) * Math.cos(second) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function safeWebsite(value) {
  const text = String(value || '').trim().slice(0, 500);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cleanHours(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

export function extractPlaceEnrichment(payload, expected = {}) {
  const details = (Array.isArray(payload?.features) ? payload.features : []).find(
    (feature) => feature?.properties?.feature_type === 'details'
  ) || payload?.features?.[0];
  const properties = details?.properties || {};
  const expectedLat = Number(expected.lat);
  const expectedLon = Number(expected.lon);
  const detailLat = Number(properties.lat);
  const detailLon = Number(properties.lon);
  const distance = distanceMeters(expectedLat, expectedLon, detailLat, detailLon);
  const expectedName = normalizedName(expected.name);
  const returnedName = normalizedName(properties.name);
  const similarity = nameSimilarity(expectedName, returnedName);

  const positionMatches = distance <= 180;
  const identityMatches = returnedName
    ? similarity >= 0.56
    : distance <= 25;

  if (!positionMatches || !identityMatches) {
    return { website: '', openingHours: '', matched: false };
  }

  return {
    website: safeWebsite(properties.website),
    openingHours: cleanHours(properties.opening_hours),
    matched: true,
  };
}

export { distanceMeters, nameSimilarity, normalizedName };
