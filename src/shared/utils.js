// Utilidades compartidas, sin dependencias de UI ni de framework.
// Reutilizables tal cual en una futura app React Native.

// ID único y estable. Usa crypto.randomUUID cuando está disponible.
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Convierte un valor de input a número seguro (>= 0). Evita NaN en los totales.
export function toAmount(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

// Formatea moneda según locale. La moneda es configurable por viaje.
export function formatMoney(amount, currency = 'USD', locale = 'es-MX') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(toAmount(amount));
  } catch {
    return toAmount(amount).toFixed(2) + ' ' + currency;
  }
}

// Formatea una fecha ISO (YYYY-MM-DD) para mostrar.
export function formatDate(iso, locale = 'es-MX') {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Sanitiza texto libre del usuario antes de guardarlo/mostrarlo.
// React ya escapa al renderizar, pero esto limpia control chars y limita longitud.
export function sanitizeText(value, maxLen = 120) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLen);
}
