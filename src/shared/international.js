export function normalizeLocale(locale, fallback = 'es-MX') {
  if (typeof locale !== 'string' || !locale.trim()) return fallback;
  try {
    return Intl.getCanonicalLocales(locale.trim())[0] || fallback;
  } catch {
    return fallback;
  }
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
