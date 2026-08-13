// Utilidades compartidas, sin dependencias de UI ni de framework.
// Reutilizables tal cual en una futura app React Native.

function secureUuidFallback(cryptoApi) {
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('No hay un generador criptográfico seguro disponible para crear IDs.');
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

// ID único y estable. Nunca cae a Math.random: Storage v4 usa estos IDs como identidad persistida.
export function uid() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return secureUuidFallback(cryptoApi);
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
