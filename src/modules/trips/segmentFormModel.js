export function isValidSegmentDateRange(startDate, endDate) {
  if (!startDate || !endDate) return true;
  return startDate <= endDate;
}

export function formatSegmentAmount(amount, locale, currency = 'USD') {
  const safeAmount = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${safeAmount.toFixed(2)} ${currency}`;
  }
}

export function formatSegmentDate(value, locale) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
}

export function formatSegmentDates(segment, locale) {
  if (!segment?.startDate && !segment?.endDate) return null;
  const formatDate = (value) => formatSegmentDate(value, locale) || '—';
  return [formatDate(segment.startDate), formatDate(segment.endDate)].join(' – ');
}

export function formatSegmentNights(segment, locale) {
  if (!segment?.startDate || !segment?.endDate) return null;

  const start = new Date(`${segment.startDate}T00:00:00Z`);
  const end = new Date(`${segment.endDate}T00:00:00Z`);
  const milliseconds = end.getTime() - start.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;

  const nights = Math.round(milliseconds / 86400000);
  const spanish = String(locale || '').toLowerCase().startsWith('es');
  const label = spanish
    ? nights === 1 ? 'noche' : 'noches'
    : nights === 1 ? 'night' : 'nights';

  return `${nights} ${label}`;
}
