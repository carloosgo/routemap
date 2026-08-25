const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{Letter}/u;

function text(value) {
  return String(value || '').trim();
}

function normalized(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function latinReadable(value) {
  const chars = [...text(value)];
  const letters = chars.filter((char) => ANY_LETTER.test(char));
  return letters.length > 0 && letters.every((char) => LATIN_LETTER.test(char));
}

function aliasesFor(item) {
  return {
    ...(item?.datasource?.raw && typeof item.datasource.raw === 'object'
      ? item.datasource.raw
      : {}),
    ...(item?.other_names && typeof item.other_names === 'object'
      ? item.other_names
      : {}),
  };
}

function cityNameCandidates(item, language) {
  const aliases = aliasesFor(item);
  const preferred = text(aliases[`name:${language}`]);
  const english = text(aliases['name:en']);
  const international = [
    text(aliases.int_name),
    text(aliases['name:int']),
    text(aliases['name:latin']),
  ];
  const providerCity = text(item?.city);
  const providerName = text(item?.name);
  const latinAliases = Object.entries(aliases)
    .filter(([key]) => key.startsWith('name:'))
    .map(([, value]) => text(value))
    .filter((candidate) => candidate && latinReadable(candidate));

  return [...new Set([
    preferred,
    english,
    ...international,
    providerCity,
    ...latinAliases,
    providerName,
  ].filter((candidate) => candidate && latinReadable(candidate)))];
}

function localizedCityName(item, language) {
  return cityNameCandidates(item, language)[0] || '';
}

function localizedCountry(countryCode, providerCountry, language) {
  try {
    const displayNames = new Intl.DisplayNames([language], { type: 'region' });
    const localized = text(displayNames.of(countryCode));
    if (localized) return localized;
  } catch {
    // El país del proveedor sigue siendo un fallback seguro.
  }
  return text(providerCountry);
}

function readableRegion(item) {
  return [text(item?.state), text(item?.state_code)]
    .find((candidate) => candidate && latinReadable(candidate)) || '';
}

function levenshteinDistance(left, right, maxDistance) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length];
}

function textuallyRelevant(item, language, query) {
  const queryKey = normalized(query);
  if (!queryKey) return true;

  for (const candidate of cityNameCandidates(item, language)) {
    const candidateKey = normalized(candidate);
    if (!candidateKey) continue;
    if (
      candidateKey === queryKey
      || candidateKey.startsWith(queryKey)
      || candidateKey.includes(` ${queryKey}`)
      || queryKey.startsWith(candidateKey)
    ) {
      return true;
    }

    if (!candidateKey.includes(' ') && !queryKey.includes(' ')) {
      const shortestLength = Math.min(candidateKey.length, queryKey.length);
      const maxDistance = shortestLength >= 8 ? 2 : shortestLength >= 4 ? 1 : 0;
      if (
        maxDistance > 0
        && levenshteinDistance(candidateKey, queryKey, maxDistance) <= maxDistance
      ) {
        return true;
      }
    }
  }

  return false;
}

function supportedResultType(item) {
  const resultType = text(item?.result_type).toLowerCase();
  return !resultType || resultType === 'city';
}

function candidateFrom(item, language, query) {
  if (
    !item
    || !supportedResultType(item)
    || !textuallyRelevant(item, language, query)
    || !validCoordinate(item.lat, -90, 90)
    || !validCoordinate(item.lon, -180, 180)
  ) {
    return null;
  }

  const countryCode = text(item.country_code).toUpperCase();
  const name = localizedCityName(item, language);
  if (!name || !/^[A-Z]{2}$/.test(countryCode)) return null;

  const country = localizedCountry(countryCode, item.country, language);
  const region = readableRegion(item);
  const lat = Number(item.lat);
  const lon = Number(item.lon);

  return {
    city: {
      id: text(item.place_id || `${lon}:${lat}`).slice(0, 256),
      name: name.slice(0, 120),
      displayName: [name, country].filter(Boolean).join(', ').slice(0, 200),
      country: country.slice(0, 100),
      countryCode,
      lat,
      lon,
    },
    sourceId: text(item.place_id),
    region: region.slice(0, 100),
    baseKey: `${normalized(name)}|${countryCode}`,
    lat,
    lon,
  };
}

function nearbyDuplicate(a, b) {
  return Math.abs(a.lat - b.lat) <= 0.12 && Math.abs(a.lon - b.lon) <= 0.12;
}

function sameCityRecord(a, b) {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  if (a.baseKey !== b.baseKey) return false;

  // Geoapify puede devolver node/boundary/centroides distintos para la misma
  // ciudad. Para etiquetas iguales sólo colapsamos representaciones cercanas;
  // homónimos realmente separados se conservan y luego se desambiguan.
  return nearbyDuplicate(a, b);
}

function withDisambiguatedDisplayName(candidate, repeatedBaseKeys) {
  const { city, region, baseKey } = candidate;
  if (!repeatedBaseKeys.has(baseKey) || !region) return city;

  return {
    ...city,
    displayName: [city.name, region, city.country]
      .filter(Boolean)
      .join(', ')
      .slice(0, 200),
  };
}

export function normalizeGeoapifyCityResults(
  items,
  { language = 'es', limit = 5, query = '' } = {}
) {
  const safeLanguage = ['es', 'en'].includes(language) ? language : 'es';
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const unique = [];

  for (const item of Array.isArray(items) ? items : []) {
    const candidate = candidateFrom(item, safeLanguage, query);
    if (!candidate) continue;
    if (unique.some((existing) => sameCityRecord(existing, candidate))) continue;
    unique.push(candidate);
  }

  const counts = new Map();
  for (const candidate of unique) {
    counts.set(candidate.baseKey, (counts.get(candidate.baseKey) || 0) + 1);
  }
  const repeatedBaseKeys = new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  );

  return unique
    .slice(0, safeLimit)
    .map((candidate) => withDisambiguatedDisplayName(candidate, repeatedBaseKeys));
}
