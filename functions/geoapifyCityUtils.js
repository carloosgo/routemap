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

function localizedCityName(item, language) {
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
  const anyLatinAlias = Object.entries(aliases)
    .filter(([key]) => key.startsWith('name:'))
    .map(([, value]) => text(value))
    .find(latinReadable) || '';

  return [
    preferred,
    english,
    ...international,
    providerCity,
    providerName,
    anyLatinAlias,
  ].find((candidate) => candidate && latinReadable(candidate)) || '';
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

function candidateFrom(item, language) {
  if (
    !item
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
    regionKey: normalized(region),
    baseKey: `${normalized(name)}|${countryCode}`,
  };
}

function sameCityRecord(a, b) {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  if (a.baseKey !== b.baseKey) return false;

  // Si Geoapify distingue regiones, Atlas conserva ambos homónimos. Si la
  // región coincide o falta en alguno, dos etiquetas iguales no aportan una
  // elección útil y se conserva el candidato mejor rankeado por el proveedor.
  if (a.regionKey && b.regionKey) return a.regionKey === b.regionKey;
  return true;
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
  { language = 'es', limit = 5 } = {}
) {
  const safeLanguage = ['es', 'en'].includes(language) ? language : 'es';
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const unique = [];

  for (const item of Array.isArray(items) ? items : []) {
    const candidate = candidateFrom(item, safeLanguage);
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
