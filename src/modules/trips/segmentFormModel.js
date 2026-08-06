export function formatSegmentAmount(amount, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export function formatSegmentDates(segment, locale) {
  if (!segment?.startDate && !segment?.endDate) return null;

  const formatDate = (value) =>
    value
      ? new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
        })
      : '—';

  return [formatDate(segment.startDate), formatDate(segment.endDate)].join(' – ');
}
