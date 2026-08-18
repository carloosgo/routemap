function formatDate(value, locale) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      })
    : '—';
}

export function formatSegmentAmount(amount, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export function formatSegmentDates(segment, locale) {
  if (!segment?.startDate && !segment?.endDate) return null;
  return [formatDate(segment.startDate, locale), formatDate(segment.endDate, locale)].join(' – ');
}

export function formatSegmentDateLines(segment, locale) {
  if (!segment?.startDate && !segment?.endDate) return [];
  return [
    formatDate(segment.startDate, locale),
    formatDate(segment.endDate, locale),
  ];
}

export function segmentNightCount(segment) {
  if (!segment?.startDate || !segment?.endDate) return null;
  const start = Date.parse(`${segment.startDate}T00:00:00Z`);
  const end = Date.parse(`${segment.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86400000);
}
