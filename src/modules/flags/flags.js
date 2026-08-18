// Módulo de banderas (independiente).
// Resuelve la bandera de un país a partir de su código ISO 3166-1 alpha-2.
// Usamos SVG de FlagCDN para mantener nitidez en cualquier densidad de pantalla.

function normalizeCountryCode(countryCode) {
  if (typeof countryCode !== 'string') return null;
  const code = countryCode.trim();
  return /^[a-z]{2}$/i.test(code) ? code.toLowerCase() : null;
}

// Mantiene la firma histórica con `width` para no acoplar los consumidores
// al proveedor. El SVG es vectorial, por lo que no necesita variantes por ancho.
export function flagImageUrl(countryCode, width) {
  void width;
  const code = normalizeCountryCode(countryCode);
  if (!code) return null;
  return `https://flagcdn.com/${code}.svg`;
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
