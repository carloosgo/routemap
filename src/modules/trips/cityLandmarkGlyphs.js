/**
 * Siluetas rellenas del lugar emblemático de cada ciudad para la miniatura del
 * Itinerario: se pintan en blanco sobre el color de la parada, como los glifos
 * de puntos de interés de los mapas. Lienzo de 24 × 24.
 *
 * Cada forma es:
 * - una cadena: trazado relleno (regla evenodd, así ventanas y puertas son huecos);
 * - `{ cx, cy, r }`: círculo relleno;
 * - `{ line }`: trazo de 1.6 de ancho para piezas finas (agujas, olas, radios).
 */

const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h-${w}z`;
const hole = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0z`;

export const CITY_LANDMARK_GLYPHS = Object.freeze({
  // Torre Eiffel
  paris: [
    'M11.5 2h1l.3 2.5h.6v1h-.5l1.6 4.5h1.4v1.3h-1l3.6 8.7h1.1V21H4.4v-1h1.1l3.6-8.7h-1V10h1.4l1.6-4.5h-.5v-1h.6z'
      + 'M8.7 20a3.3 3.3 0 0 1 6.6 0z' + rect(9.6, 13.6, 4.8, 0.9),
  ],
  // Casas del canal
  amsterdam: [
    'M3 21V10.5l2.75-3 2.75 3V21z' + rect(5.1, 12, 1.3, 1.8) + rect(5.1, 16, 1.3, 1.8),
    'M8.8 21V8h.9V6.5h.9V5h2.8v1.5h.9V8h.9v13z' + rect(10.1, 9.8, 1.3, 1.8) + rect(12.6, 9.8, 1.3, 1.8)
      + rect(10.1, 13.6, 1.3, 1.8) + rect(12.6, 13.6, 1.3, 1.8) + rect(11.1, 17.6, 1.8, 3.4),
    'M15.5 21v-9.5a2.75 2.75 0 0 1 5.5 0V21z' + rect(17.6, 13, 1.3, 1.8) + rect(17.6, 16.8, 1.3, 1.8),
  ],
  // Campanario (Belfort) entre casas de gablete
  bruges: [
    'M9 21v-8h.8V8h.8V5h.9V2.5h1V5h.9v3h.8v5h.8v8z' + 'M11 21v-2a1 1 0 0 1 2 0v2z' + hole(12, 10.5, 0.9),
    'M2.8 21v-5l3-2.8 2.9 2.8V21z', 'M15.3 21v-5l2.9-2.8 3 2.8V21z',
  ],
  // Castillo de los Condes (Gravensteen)
  ghent: [
    'M8 21V5h1.6v1.5h1.6V5h1.6v1.5h1.6V5H16v16z' + 'M10.5 21v-3a1.5 1.5 0 0 1 3 0v3z' + rect(11.4, 8.5, 1.2, 2),
    'M3.5 21v-8.5h1.2V11H6v1.5h1V11h1v10z', 'M20.5 21v-8.5h-1.2V11H18v1.5h-1V11h-1v10z',
  ],
  // Atomium
  brussels: [
    { line: 'M12 4.2 6 8l6 3.6 6-3.6zM6 8v7l6 4.2 6-4.2V8M12 11.6v7.6M6 15l6-3.4 6 3.4' },
    { line: 'M6 15l-1 6M18 15l1 6M12 19.2V21' },
    { cx: 12, cy: 4.2, r: 2 }, { cx: 6, cy: 8, r: 2 }, { cx: 18, cy: 8, r: 2 }, { cx: 12, cy: 11.6, r: 2 },
    { cx: 6, cy: 15, r: 2 }, { cx: 18, cy: 15, r: 2 }, { cx: 12, cy: 19.2, r: 2 },
  ],
  // Catedral de dos agujas
  cologne: [
    'M5 21V10l2-6.5L9 10v11z' + rect(6.6, 12.5, 0.8, 2.6), 'M15 21V10l2-6.5 2 6.5v11z' + rect(16.6, 12.5, 0.8, 2.6),
    'M9 21v-7.5l3-1.5 3 1.5V21z' + hole(12, 16, 1.1),
    { line: 'M7 3.5V2M17 3.5V2' },
  ],
  // Puerta de Brandeburgo
  berlin: [
    rect(10, 4.3, 4, 1.7), rect(4, 6, 16, 2.4), rect(3, 8.8, 18, 1.6),
    rect(3.75, 10.4, 1.5, 9.6), rect(6.75, 10.4, 1.5, 9.6), rect(9.75, 10.4, 1.5, 9.6),
    rect(12.75, 10.4, 1.5, 9.6), rect(15.75, 10.4, 1.5, 9.6), rect(18.75, 10.4, 1.5, 9.6), rect(3, 20, 18, 1),
  ],
  // Frauenkirche, torres con cúpula de bulbo
  munich: [
    'M6 21V9.5c0-2.2 2-2.6 2-4.8 0 2.2 2 2.6 2 4.8V21z' + rect(7.4, 12.5, 1.2, 2.4),
    'M14 21V9.5c0-2.2 2-2.6 2-4.8 0 2.2 2 2.6 2 4.8V21z' + rect(15.4, 12.5, 1.2, 2.4),
    'M10 21v-7.5h4V21z', { line: 'M8 4.7V3M16 4.7V3' },
  ],
  // Torre de muralla medieval
  nuremberg: [
    'M7.6 9.2 12 3l4.4 6.2z', 'M8 21V9.6h8V21z' + 'M10 21v-3a2 2 0 0 1 4 0v3z' + rect(11.4, 11.5, 1.2, 2.2),
    'M2.8 21v-6.5h1.4V13h1.4v1.5h1V13h1.1v1.5h.3V21z', 'M21.2 21v-6.5h-1.4V13h-1.4v1.5h-1V13h-1.1v1.5H16V21z',
  ],
  rothenburg: 'nuremberg',
  // Casa de entramado
  bamberg: [
    'M5 21V10.6L12 4.4l7 6.2V21z' + rect(7.4, 11.6, 2, 2) + rect(14.6, 11.6, 2, 2) + rect(11, 8.6, 2, 2)
      + rect(7.4, 15.6, 2, 2) + rect(14.6, 15.6, 2, 2) + rect(11, 16.6, 2, 4.4),
    'M3.2 11.4 12 3.6l8.8 7.8-.8.9L12 5.2l-8 7.1z',
  ],
  // Big Ben y el Parlamento
  london: [
    'M9.5 21V9.6h5V21z' + hole(12, 12.4, 1.5), rect(9, 8.4, 6, 1.2), 'M10 8.4V6.6h4v1.8z', 'M10 6.6 12 2.4l2 4.2z',
    'M3 21v-6h6.5v6z' + rect(4.6, 16.5, 1, 2) + rect(6.9, 16.5, 1, 2),
    'M14.5 21v-6H21v6z' + rect(16.1, 16.5, 1, 2) + rect(18.4, 16.5, 1, 2),
  ],
  // Puerta de Alcalá
  madrid: [
    'M3 21V9h18v12z' + 'M5 21v-5a2 2 0 0 1 4 0v5z' + 'M10 21v-6a2 2 0 0 1 4 0v6z' + 'M15 21v-5a2 2 0 0 1 4 0v5z',
    'M8 8.4V6.5h8v1.9z', 'M11 6.5l1-1.6 1 1.6z',
  ],
  // Sagrada Familia
  barcelona: [
    'M4.4 21V11l1.6-5.5L7.6 11v10z', 'M8.4 21V8.5L10 2.6l1.6 5.9V21z', 'M12.4 21V8.5L14 2.6l1.6 5.9V21z',
    'M16.4 21V11L18 5.5l1.6 5.5v10z', rect(3.4, 20, 17.2, 1),
  ],
  // Coliseo
  rome: [
    'M3 8.5C5 6.9 8.5 6 12 6s7 .9 9 2.5V20H3z'
      + rect(4.6, 9.6, 1.6, 2) + rect(8.2, 9, 1.6, 2.6) + rect(11.2, 8.8, 1.6, 2.8) + rect(14.2, 9, 1.6, 2.6) + rect(17.8, 9.6, 1.6, 2)
      + 'M4.6 18.4v-3.2a.8.8 0 0 1 1.6 0v3.2z' + 'M8.2 18.4v-3.2a.8.8 0 0 1 1.6 0v3.2z' + 'M11.2 18.4v-3.2a.8.8 0 0 1 1.6 0v3.2z'
      + 'M14.2 18.4v-3.2a.8.8 0 0 1 1.6 0v3.2z' + 'M17.8 18.4v-3.2a.8.8 0 0 1 1.6 0v3.2z',
  ],
  // Góndola
  venice: [
    'M2.6 13.6c3.6 3 13.6 3.2 18-1.2l1 .2c-.6 2.2-3.6 4.6-9.4 4.6-5.4 0-8.6-1.6-9.6-3.4z',
    { line: 'M14 5.5l-2 9M11.8 5.5h4.4' },
    { line: 'M3 20.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1' },
  ],
  // Torre del Puente de Carlos
  prague: [
    'M8.4 9 12 2.4 15.6 9z', 'M8.5 16V9.4h7V16z' + rect(11.4, 11, 1.2, 2.2),
    'M1.8 21v-5h20.4v5h-1.6a2.6 2.6 0 0 0-5.2 0h-2.1v-2.2a1.3 1.3 0 0 0-2.6 0V21H8.6a2.6 2.6 0 0 0-5.2 0z',
  ],
  // Noria del Prater
  vienna: [
    { line: 'M12 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14M5 10h14M12 3v14M7 5l10 10M17 5 7 15' },
    { cx: 12, cy: 10, r: 1.6 },
    'M11.2 10.6h1.6L17.4 21h-1.8L12 12.6 8.4 21H6.6z', rect(5, 20, 14, 1),
  ],
  // Rascacielos
  frankfurt: [
    'M3.6 21v-9h4.2v9z', 'M8.2 21V6h4.6v15z' + rect(9.6, 8.5, 1.8, 1) + rect(9.6, 11.5, 1.8, 1) + rect(9.6, 14.5, 1.8, 1),
    'M13.2 21V9.6l3.6-2.2V21z', 'M17.2 21v-7h3.2v7z', { line: 'M10.5 6V3' },
  ],
  // Ángel de la Independencia
  metropolis: [
    'M6.8 21v-1.2h1.2v-1.6h1.6v-1.6h4.8v1.6h1.6v1.6h1.2V21z', rect(11, 7.6, 2, 9), rect(10.2, 6.6, 3.6, 1),
    'M12 6.6c-2.2-.6-3.4-2.4-3.4-4.4 1 .9 2.3 1.5 3.4 1.7 1.1-.2 2.4-.8 3.4-1.7 0 2-1.2 3.8-3.4 4.4z',
    { cx: 12, cy: 2.3, r: 0.9 },
  ],
  // Ciudad genérica
  generic: [
    'M3.6 21V10h5v11z' + rect(5.3, 12.4, 1.6, 1.4) + rect(5.3, 15.6, 1.6, 1.4),
    'M9.2 21V4.6h5.6V21z' + rect(10.6, 7, 1, 1.4) + rect(12.4, 7, 1, 1.4) + rect(10.6, 10.4, 1, 1.4)
      + rect(12.4, 10.4, 1, 1.4) + rect(10.6, 13.8, 1, 1.4) + rect(12.4, 13.8, 1, 1.4),
    'M15.4 21v-8h5v8z' + rect(17.1, 15, 1.6, 1.4),
  ],
});

/** Formas de la silueta de una ciudad; las entradas de texto son alias de otra ciudad. */
export function cityLandmarkGlyph(kind) {
  const entry = CITY_LANDMARK_GLYPHS[kind] ?? CITY_LANDMARK_GLYPHS.generic;
  return typeof entry === 'string' ? CITY_LANDMARK_GLYPHS[entry] : entry;
}
