const PLACE_CUES = new Set([
  'aeropuerto', 'airport', 'bar', 'cafe', 'café', 'cafeteria', 'cafetería',
  'castillo', 'castle', 'catedral', 'cathedral', 'centro comercial', 'church',
  'estacion', 'estación', 'gallery', 'galeria', 'galería', 'gate', 'hostal',
  'hostel', 'hotel', 'iglesia', 'mall', 'market', 'mercado', 'monument',
  'monumento', 'museo', 'museum', 'palace', 'palacio', 'parque', 'park',
  'plaza', 'puente', 'puerta', 'restaurant', 'restaurante', 'station',
  'templo', 'temple', 'torre', 'tower', 'universidad', 'university',
  'zoologico', 'zoológico', 'zoo', 'playa', 'beach', 'terminal',
  'tienda', 'store', 'shop', 'avenida', 'avenue', 'calle', 'street',
  'boulevard', 'blvd', 'carretera', 'road', 'rd', 'biblioteca', 'library',
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function words(value) {
  return normalize(value).split(' ').filter(Boolean);
}

function hasPlaceCue(query) {
  const normalized = normalize(query);
  const tokens = words(query);
  if (/\d/.test(String(query || ''))) return true;
  if (tokens.some((token) => PLACE_CUES.has(token))) return true;
  return [...PLACE_CUES]
    .filter((cue) => cue.includes(' '))
    .some((cue) => normalized.includes(cue));
}

export function preferredSearchProvider(query) {
  const text = String(query || '').trim();
  if (!text) return 'city';
  return hasPlaceCue(text) ? 'google' : 'city';
}

function citySearchText(city) {
  return normalize([
    city?.name,
    city?.region,
    city?.regionCode,
    city?.country,
    city?.countryCode,
    city?.displayName,
  ].filter(Boolean).join(' '));
}

export function cityMatchesQuery(city, query) {
  const normalizedQuery = normalize(query);
  const normalizedName = normalize(city?.name);
  if (!normalizedQuery || !normalizedName) return false;

  if (normalizedName === normalizedQuery) return true;
  if (normalizedName.startsWith(normalizedQuery)) return true;

  const queryTokens = words(normalizedQuery);
  const cityTokens = new Set(words(citySearchText(city)));
  if (!queryTokens.length) return false;
  if (!normalizedName.startsWith(queryTokens[0])) return false;
  return queryTokens.every((token) => cityTokens.has(token));
}

export function matchingCityResults(results, query) {
  return (Array.isArray(results) ? results : []).filter((city) => cityMatchesQuery(city, query));
}
