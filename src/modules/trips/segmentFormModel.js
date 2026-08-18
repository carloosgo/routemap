export function formatSegmentAmount(amount, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export function formatSegmentDate(value, locale) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      })
    : '—';
}

export function formatSegmentDateParts(segment, locale) {
  return {
    start: formatSegmentDate(segment?.startDate, locale),
    end: formatSegmentDate(segment?.endDate, locale),
    hasValue: Boolean(segment?.startDate || segment?.endDate),
  };
}

export function segmentNightCount(segment) {
  if (!segment?.startDate || !segment?.endDate) return null;
  const start = Date.parse(`${segment.startDate}T00:00:00Z`);
  const end = Date.parse(`${segment.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86400000);
}

export function formatSegmentNights(segment, locale) {
  const nights = segmentNightCount(segment);
  if (nights == null) return null;
  const spanish = String(locale || '').toLowerCase().startsWith('es');
  const label = spanish
    ? nights === 1 ? 'noche' : 'noches'
    : nights === 1 ? 'night' : 'nights';
  return `${nights} ${label}`;
}

export function formatSegmentDates(segment, locale) {
  const dates = formatSegmentDateParts(segment, locale);
  if (!dates.hasValue) return null;
  return [dates.start, dates.end].join(' – ');
}
