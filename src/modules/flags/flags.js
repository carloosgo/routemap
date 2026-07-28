// Módulo de banderas (independiente).
// Resuelve la bandera de un país a partir de su código ISO 3166-1 alpha-2.
// Estrategia por defecto: imágenes de flagcdn.com (ligeras, con CDN propio).
// Para evitar dependencia externa puedes cambiar a emoji con codePointAt.

// URL de imagen de bandera. width: 20 | 40 | 80 ...
export function flagImageUrl(countryCode, width = 40) {
  if (!countryCode) return null;
  const code = countryCode.toLowerCase();
  return `https://flagcdn.com/w${width}/${code}.png`;
}

// Alternativa 100% local (sin red): bandera como emoji.
// Útil como fallback o si decides no depender de un CDN de imágenes.
export function flagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  const base = 0x1f1e6;
  const chars = countryCode
    .toUpperCase()
    .split('')
    .map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}
