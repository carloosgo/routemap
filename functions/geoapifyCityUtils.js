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
  const international = text(aliases.int_name || aliases['name:int'] || aliases['name:latin']);
  const providerCity = text(item?.city);
  const providerName = text(item?.name);
  const anyLatinAlias = Object.entries(aliases)
    .filter(([key]) => key.startsWith('name:'))
    .map(([, value]) => text(value))
    .find(latinReadable) || '';

  // Atlas solo expone nombres de ciudad legibles en alfabeto latino para los
  // idiomas soportados. Si Geoapify no entrega un alias latino fiable, el
  // candidato se descarta en vez de reintroducir el nombre nativo como fallback.
  return [
    preferred,
    english,
    international,
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

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

function distanceKm(a, b) {
  const earthRadiusKm = 6371;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.lon) - toRadians(a.lon);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
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
    stateKey: normalized(item.state || item.state_code),
    countyKey: normalized(item.county || item.county_code),
  };
}

function sameSettlement(a, b) {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  if (a.city.countryCode !== b.city.countryCode) return false;
  if (normalized(a.city.name) !== normalized(b.city.name)) return false;

  const separation = distanceKm(a.city, b.city);
  if (separation <= 30) return true;

  const sameState = a.stateKey && b.stateKey && a.stateKey === b.stateKey;
  const sameCounty = a.countyKey && b.countyKey && a.countyKey === b.countyKey;
  return Boolean(sameState && sameCounty && separation <= 80);
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
    if (unique.some((existing) => sameSettlement(existing, candidate))) continue;
    unique.push(candidate);
    if (unique.length >= safeLimit) break;
  }

  return unique.map(({ city }) => city);
}
