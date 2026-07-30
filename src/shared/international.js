const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

export function normalizeLocale(locale, fallback = 'es-MX') {
  if (typeof locale !== 'string' || !locale.trim()) return fallback;
  try {
    return Intl.getCanonicalLocales(locale.trim())[0] || fallback;
  } catch {
    return fallback;
  }
}

export function regionFromLocale(locale) {
  const normalized = normalizeLocale(locale);
  try {
    return new Intl.Locale(normalized).region || '';
  } catch {
    return '';
  }
}

export function unitSystemForLocale(locale) {
  return IMPERIAL_REGIONS.has(regionFromLocale(locale)) ? 'imperial' : 'metric';
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timeZone.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function formatDateInTimeZone(
  value,
  { locale = 'es-MX', timeZone = 'UTC', dateStyle = 'medium' } = {}
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone.trim() : 'UTC';
  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    dateStyle,
    timeZone: safeTimeZone,
  }).format(date);
}

export function formatTimeInTimeZone(
  value,
  { locale = 'es-MX', timeZone = 'UTC', hour12 } = {}
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone.trim() : 'UTC';
  const options = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: safeTimeZone,
    timeZoneName: 'short',
  };
  if (typeof hour12 === 'boolean') options.hour12 = hour12;
  return new Intl.DateTimeFormat(normalizeLocale(locale), options).format(date);
}

export function kilometersToMiles(kilometers) {
  const value = Number(kilometers);
  return Number.isFinite(value) ? value * 0.6213711922 : 0;
}

export function milesToKilometers(miles) {
  const value = Number(miles);
  return Number.isFinite(value) ? value / 0.6213711922 : 0;
}

export function formatDistance(kilometers, locale = 'es-MX', unitSystem) {
  const value = Number(kilometers);
  const safeKilometers = Number.isFinite(value) && value >= 0 ? value : 0;
  const system = unitSystem || unitSystemForLocale(locale);
  const converted = system === 'imperial' ? kilometersToMiles(safeKilometers) : safeKilometers;
  const unit = system === 'imperial' ? 'mile' : 'kilometer';
  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: converted < 10 ? 1 : 0,
  }).format(converted);
}
