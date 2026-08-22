export function sanitizeMoneyDraft(value) {
  const raw = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^0-9.]/g, '');

  if (!raw) return '';

  const dotIndex = raw.indexOf('.');
  const hasDecimal = dotIndex >= 0;
  const integerPart = hasDecimal ? raw.slice(0, dotIndex) : raw;
  const decimalSource = hasDecimal
    ? raw.slice(dotIndex + 1).replace(/\./g, '')
    : '';
  const safeInteger = integerPart || '0';
  const decimals = decimalSource.slice(0, 2);

  return hasDecimal ? `${safeInteger}.${decimals}` : safeInteger;
}

function formatIntegerPart(value) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoneyDraft(value) {
  const sanitized = sanitizeMoneyDraft(value);
  if (!sanitized) return '';

  const hasDecimal = sanitized.includes('.');
  const [integerPart, decimals = ''] = sanitized.split('.');
  const formattedInteger = formatIntegerPart(integerPart);

  return hasDecimal ? `${formattedInteger}.${decimals}` : formattedInteger;
}

export function parseMoneyDraft(value) {
  const sanitized = sanitizeMoneyDraft(value);
  if (!sanitized || sanitized === '.') return 0;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function formatMoneyValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return formatMoneyDraft(String(amount));
}
