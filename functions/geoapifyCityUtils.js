const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{Letter}/u;
const GEOAPIFY_DECLINE_CONFIDENCE = 0.2;
const CITY_LEVEL_MATCH_TYPES = new Set([
  'full_match',
  'inner_part',
  'match_by_city_or_disrict',
]);

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

function allNameValues(item) {
  const aliases = aliasesFor(item);
  return [...new Set([
    text(item?.city),
    text(item?.name),
    ...Object.entries(aliases)
      .filter(([key]) => key === 'int_name' || key.startsWith('name:'))
      .map(([, value]) => text(value)),
  ].filter(Boolean))];
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

function regionMetadata(item, cityIdentityKeys) {
  const rawName = text(item?.state);
  const rawCode = text(item?.state_code);
  const identityKeys = new Set(
    [rawName, rawCode]
      .map(normalized)
      .filter(Boolean)
  );
  const regionIsCity = [...identityKeys].some((key) => cityIdentityKeys.has(key));
  const readableName = rawName && latinReadable(rawName) ? rawName : '';
  const readableCode = rawCode && latinReadable(rawCode) ? rawCode : '';

  return {
    name: regionIsCity ? '' : readableName.slice(0, 100),
    code: regionIsCity ? '' : readableCode.slice(0, 24),
    identityKeys,
    regionIsCity,
  };
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

function textMatchQuality(nameCandidates, query) {
  const queryKey = normalized(query);
  if (!queryKey) return 'strong';

  let fuzzyMatch = false;
  for (const candidate of nameCandidates) {
    const candidateKey = normalized(candidate);
    if (!candidateKey) continue;
    if (
      candidateKey === queryKey
      || candidateKey.startsWith(queryKey)
      || candidateKey.includes(` ${queryKey}`)
      || queryKey.startsWith(candidateKey)
    ) {
      return 'strong';
    }

    if (!candidateKey.includes(' ') && !queryKey.includes(' ')) {
      const shortestLength = Math.min(candidateKey.length, queryKey.length);
      const maxDistance = shortestLength >= 8 ? 2 : shortestLength >= 4 ? 1 : 0;
      if (
        maxDistance > 0
        && levenshteinDistance(candidateKey, queryKey, maxDistance) <= maxDistance
      ) {
        fuzzyMatch = true;
      }
    }
  }

  return fuzzyMatch ? 'fuzzy' : 'none';
}

function rankNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function providerRank(item) {
  const rank = item?.rank && typeof item.rank === 'object' ? item.rank : {};
  return {
    confidence: rankNumber(rank.confidence),
    confidenceCityLevel: rankNumber(rank.confidence_city_level),
    matchType: text(rank.match_type).toLowerCase(),
    importance: rankNumber(rank.importance),
    popularity: rankNumber(rank.popularity),
  };
}

function rankSupportsTextMatch(rank, matchQuality) {
  if (matchQuality === 'none') return false;

  const confidences = [rank.confidence, rank.confidenceCityLevel]
    .filter((value) => value !== null);
  if (
    confidences.length > 0
    && Math.max(...confidences) < GEOAPIFY_DECLINE_CONFIDENCE
  ) {
    return false;
  }

  if (
    matchQuality === 'fuzzy'
    && rank.matchType
    && !CITY_LEVEL_MATCH_TYPES.has(rank.matchType)
  ) {
    return false;
  }

  return true;
}

function supportedResultType(item) {
  const resultType = text(item?.result_type).toLowerCase();
  return !resultType || resultType === 'city';
}

function candidateFrom(item, language, query) {
  if (!item || !supportedResultType(item)) return null;

  const nameCandidates = cityNameCandidates(item, language);
  const matchQuality = textMatchQuality(nameCandidates, query);
  const rank = providerRank(item);
  if (
    !rankSupportsTextMatch(rank, matchQuality)
    || !validCoordinate(item.lat, -90, 90)
    || !validCoordinate(item.lon, -180, 180)
  ) {
    return null;
  }

  const countryCode = text(item.country_code).toUpperCase();
  const name = nameCandidates[0] || '';
  if (!name || !/^[A-Z]{2}$/.test(countryCode)) return null;

  const country = localizedCountry(countryCode, item.country, language);
  const cityIdentityKeys = new Set(
    allNameValues(item)
      .map(normalized)
      .filter(Boolean)
  );
  const region = regionMetadata(item, cityIdentityKeys);
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
    aliasKeys: cityIdentityKeys,
    region,
    rank,
    matchQuality,
    visibleBaseKey: `${normalized(name)}|${countryCode}`,
  };
}

function setsIntersect(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function effectiveRegionKeys(candidate) {
  return new Set(
    [...candidate.region.identityKeys]
      .filter((key) => !candidate.aliasKeys.has(key))
  );
}

function sameCityRecord(a, b) {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  if (a.city.countryCode !== b.city.countryCode) return false;
  if (!setsIntersect(a.aliasKeys, b.aliasKeys)) return false;

  if (a.region.regionIsCity || b.region.regionIsCity) return true;

  const aRegionKeys = effectiveRegionKeys(a);
  const bRegionKeys = effectiveRegionKeys(b);
  if (aRegionKeys.size === 0 || bRegionKeys.size === 0) return true;
  return setsIntersect(aRegionKeys, bRegionKeys);
}

function rankValue(value) {
  return value === null ? -1 : value;
}

function matchQualityValue(value) {
  if (value === 'strong') return 2;
  if (value === 'fuzzy') return 1;
  return 0;
}

function matchTypeValue(value) {
  if (value === 'full_match') return 3;
  if (value === 'match_by_city_or_disrict') return 2;
  if (value === 'inner_part') return 1;
  return 0;
}

function candidateQuality(candidate) {
  return [
    matchQualityValue(candidate.matchQuality),
    rankValue(candidate.rank.confidenceCityLevel),
    rankValue(candidate.rank.confidence),
    matchTypeValue(candidate.rank.matchType),
    rankValue(candidate.rank.importance),
    rankValue(candidate.rank.popularity),
  ];
}

function qualityIsBetter(left, right) {
  const leftQuality = candidateQuality(left);
  const rightQuality = candidateQuality(right);
  for (let index = 0; index < leftQuality.length; index += 1) {
    if (leftQuality[index] !== rightQuality[index]) {
      return leftQuality[index] > rightQuality[index];
    }
  }
  return false;
}

function mergeDuplicate(existing, incoming) {
  const preferredMetadata = qualityIsBetter(incoming, existing) ? incoming : existing;
  const alternateMetadata = preferredMetadata === existing ? incoming : existing;

  existing.aliasKeys = new Set([...existing.aliasKeys, ...incoming.aliasKeys]);
  existing.region.identityKeys = new Set([
    ...existing.region.identityKeys,
    ...incoming.region.identityKeys,
  ]);
  existing.region.regionIsCity =
    existing.region.regionIsCity || incoming.region.regionIsCity;

  if (!existing.region.regionIsCity) {
    existing.region.name = (
      preferredMetadata.region.name
      || alternateMetadata.region.name
      || existing.region.name
    );
    existing.region.code = (
      preferredMetadata.region.code
      || alternateMetadata.region.code
      || existing.region.code
    );
  } else {
    existing.region.name = '';
    existing.region.code = '';
  }

  return existing;
}

function publicCity(candidate, { includeRegionMetadata, disambiguate }) {
  const regionLabel = candidate.region.name || candidate.region.code;
  const displayName = disambiguate && regionLabel
    ? [candidate.city.name, regionLabel, candidate.city.country]
      .filter(Boolean)
      .join(', ')
      .slice(0, 200)
    : candidate.city.displayName;

  const city = {
    ...candidate.city,
    displayName,
  };

  if (!includeRegionMetadata) return city;
  return {
    ...city,
    region: candidate.region.name,
    regionCode: candidate.region.code,
  };
}

export function buildGeoapifyCitySearchUrl({
  query,
  limit = 5,
  language = 'es',
  apiKey,
} = {}) {
  const safeLanguage = ['es', 'en'].includes(language) ? language : 'es';
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const params = new URLSearchParams({
    text: text(query).slice(0, 120),
    type: 'city',
    format: 'json',
    lang: safeLanguage,
    limit: String(safeLimit),
    bias: 'countrycode:none',
    apiKey: text(apiKey),
  });
  return `https://api.geoapify.com/v1/geocode/search?${params}`;
}

export function normalizeGeoapifyCityResults(
  items,
  {
    language = 'es',
    limit = 5,
    query = '',
    includeRegionMetadata = false,
  } = {}
) {
  const safeLanguage = ['es', 'en'].includes(language) ? language : 'es';
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const unique = [];

  for (const item of Array.isArray(items) ? items : []) {
    const candidate = candidateFrom(item, safeLanguage, query);
    if (!candidate) continue;

    const existing = unique.find((entry) => sameCityRecord(entry, candidate));
    if (existing) {
      mergeDuplicate(existing, candidate);
      continue;
    }
    unique.push(candidate);
  }

  const counts = new Map();
  for (const candidate of unique) {
    counts.set(
      candidate.visibleBaseKey,
      (counts.get(candidate.visibleBaseKey) || 0) + 1
    );
  }

  return unique
    .slice(0, safeLimit)
    .map((candidate) => publicCity(candidate, {
      includeRegionMetadata,
      disambiguate: (counts.get(candidate.visibleBaseKey) || 0) > 1,
    }));
}
