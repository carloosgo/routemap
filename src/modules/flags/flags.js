// Módulo de banderas (independiente).
// Resuelve la bandera de un país a partir de su código ISO 3166-1 alpha-2.
// Estrategia por defecto: imágenes de flagcdn.com (ligeras, con CDN propio).
// Para evitar dependencia externa puedes cambiar a emoji con codePointAt.

const DEFAULT_FLAG_WIDTH = 40;
const ALLOWED_FLAG_WIDTHS = new Set([20, 40, 80, 160, 320, 640, 1280, 2560]);

function normalizeCountryCode(countryCode) {
  if (typeof countryCode !== 'string') return null;
  const code = countryCode.trim();
  return /^[a-z]{2}$/i.test(code) ? code.toLowerCase() : null;
}

// URL de imagen de bandera. Acepta únicamente código ISO alpha-2 y anchos de FlagCDN.
export function flagImageUrl(countryCode, width = DEFAULT_FLAG_WIDTH) {
  const code = normalizeCountryCode(countryCode);
  if (!code) return null;
  const safeWidth = ALLOWED_FLAG_WIDTHS.has(Number(width)) ? Number(width) : DEFAULT_FLAG_WIDTH;
  return `https://flagcdn.com/w${safeWidth}/${code}.png`;
}

// Alternativa 100% local (sin red): bandera como emoji.
// Útil como fallback o si decides no depender de un CDN de imágenes.
export function flagEmoji(countryCode) {
  const code = normalizeCountryCode(countryCode);
  if (!code) return '';
  const base = 0x1f1e6;
  const chars = code
    .toUpperCase()
    .split('')
    .map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}
