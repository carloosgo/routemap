export function normalizeSearchKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function contextualQuery(query, context) {
  const base = String(query || '').trim();
  const normalized = normalizeSearchKey(base);
  const city = String(context?.city || '').trim();
  const country = String(context?.country || '').trim();
  const knownLocations = Array.isArray(context?.knownLocations) ? context.knownLocations : [];
  const explicitlyNamesLocation = [...knownLocations, city, country]
    .filter(Boolean)
    .some((value) => normalized.includes(normalizeSearchKey(value)));
  const isGenericSingleTerm = normalized.split(' ').filter(Boolean).length === 1;

  if (!base || explicitlyNamesLocation || !isGenericSingleTerm || (!city && !country)) {
    return base;
  }

  return [base, city, country].filter(Boolean).join(', ');
}

export function contextKey(context) {
  return [
    normalizeSearchKey(context?.city),
    normalizeSearchKey(context?.country),
    Number.isFinite(context?.lat) ? Number(context.lat).toFixed(4) : '',
    Number.isFinite(context?.lon) ? Number(context.lon).toFixed(4) : '',
  ].join('|');
}

export function callableSearchContext(context) {
  return {
    city: String(context?.city || '').trim(),
    country: String(context?.country || '').trim(),
    countryCode: String(context?.countryCode || '').trim().toUpperCase(),
    lat: Number.isFinite(context?.lat) ? Number(context.lat) : null,
    lon: Number.isFinite(context?.lon) ? Number(context.lon) : null,
  };
}
