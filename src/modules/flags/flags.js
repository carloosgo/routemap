// Módulo de banderas (independiente).
// Resuelve la bandera de un país a partir de su código ISO 3166-1 alpha-2.

const FLAG_WIDTHS = new Set([20, 40, 80]);
const DEFAULT_FLAG_WIDTH = 40;

function normalizeCountryCode(countryCode) {
  if (typeof countryCode !== 'string') return null;
  const code = countryCode.trim();
  return /^[a-z]{2}$/i.test(code) ? code.toLowerCase() : null;
}

// FlagCDN entrega PNGs ya rasterizados a densidad suficiente. En el timeline
// solicitamos w80 y lo reducimos a 30×20 CSS px: ese supersampling mantiene
// más legibles los escudos pequeños (México/España) que un SVG rasterizado
// directamente al tamaño final por cada navegador.
export function flagImageUrl(countryCode, width = DEFAULT_FLAG_WIDTH) {
  const code = normalizeCountryCode(countryCode);
  if (!code) return null;
  const safeWidth = FLAG_WIDTHS.has(width) ? width : DEFAULT_FLAG_WIDTH;
  return `https://flagcdn.com/w${safeWidth}/${code}.png`;
}

// Alternativa 100% local (sin red): bandera como emoji.
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
