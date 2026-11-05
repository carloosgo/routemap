/**
 * Iconos de lugar emblemático por ciudad para las tarjetas del Itinerario.
 * Misma familia visual que Tabler (lienzo 24 × 24, trazo redondeado, sin
 * relleno) para convivir con el resto de iconos de la app. Cada entrada es una
 * lista de trazos SVG (`d`) o círculos `{ cx, cy, r }`.
 */

const WAVE = 'M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1';

export const CITY_LANDMARK_ICONS = Object.freeze({
  // Torre Eiffel
  paris: [
    'M12 2v2', 'M11 4h2', 'M11 4 9.5 11', 'M13 4l1.5 7', 'M8.5 11h7',
    'M9.5 11 6 21', 'M14.5 11 18 21', 'M7.9 15.5h8.2', 'M9 21a3 3 0 0 1 6 0', 'M4.5 21h15',
  ],
  // Casas del canal
  amsterdam: [
    'M3.5 21V10l2.5-3 2.5 3v11',
    'M8.5 21V8h1V6.5h1V5h2v1.5h1V8h1v13',
    'M15 21v-9.5a2.5 2.5 0 0 1 5 0V21',
    'M6 12.5v1.5', 'M6 16.5V18', 'M10.5 10.5V12', 'M12.5 10.5V12', 'M10.5 14.5V16',
    'M12.5 14.5V16', 'M17.5 14v1.5', 'M17.5 18v1.5', 'M2 21h20',
  ],
  // Campanario (Belfort) entre casas de gablete
  bruges: [
    'M9 21V13h6v8', 'M9.75 13V8h4.5v5', 'M10.5 8V5h3v3', 'M12 5V2.5',
    'M11 21v-2a1 1 0 0 1 2 0v2', 'M12 10v1.5',
    'M3.5 21v-5l2.75-2.5L9 16', 'M15 16l2.75-2.5L20.5 16v5', 'M2.5 21h19',
  ],
  // Castillo de los Condes (Gravensteen)
  ghent: [
    'M8 21V5h1.6v1.5h1.6V5h1.6v1.5h1.6V5H16v16',
    'M8 13H4.5v8', 'M4.5 13v-1.5H6V13h1v-1.5h1', 'M16 13h3.5v8', 'M19.5 13v-1.5H18V13h-1v-1.5h-1',
    'M10.5 21v-3a1.5 1.5 0 0 1 3 0v3', 'M12 9v1.5', 'M2.5 21h19',
  ],
  // Atomium
  brussels: [
    { cx: 12, cy: 4, r: 1.5 }, { cx: 12, cy: 11.5, r: 1.5 }, { cx: 6, cy: 8, r: 1.5 },
    { cx: 18, cy: 8, r: 1.5 }, { cx: 6, cy: 15, r: 1.5 }, { cx: 18, cy: 15, r: 1.5 },
    'M13.3 4.8l3.4 2.4', 'M10.7 4.8 7.3 7.2', 'M6 9.5v4', 'M18 9.5v4',
    'M7.3 14.2l3.4-1.9', 'M16.7 14.2l-3.4-1.9', 'M12 5.5v4.5',
    'M6 16.5 5 21', 'M18 16.5l1 4.5', 'M12 13v8', 'M3.5 21h17',
  ],
  // Catedral de dos agujas
  cologne: [
    'M5 21V10l2-6 2 6v11', 'M15 21V10l2-6 2 6v11', 'M9 21v-7h6v7', 'M7 4V2.5', 'M17 4V2.5',
    'M7 13v2', 'M17 13v2', { cx: 12, cy: 16.5, r: 1 }, 'M3 21h18',
  ],
  // Puerta de Brandeburgo
  berlin: [
    'M10 6V4.5h4V6', 'M4 8V6h16v2', 'M3 10h18', 'M3 8h18',
    'M4.5 10v11', 'M7.5 10v11', 'M10.5 10v11', 'M13.5 10v11', 'M16.5 10v11', 'M19.5 10v11',
    'M3 21h18',
  ],
  // Frauenkirche, torres con cúpula de bulbo
  munich: [
    'M6 21V9.5h4V21', 'M14 21V9.5h4V21', 'M6 9.5c0-2.2 2-2.6 2-4.8 0 2.2 2 2.6 2 4.8',
    'M14 9.5c0-2.2 2-2.6 2-4.8 0 2.2 2 2.6 2 4.8', 'M8 4.7V3', 'M16 4.7V3',
    'M10 21v-7h4v7', 'M8 12.5v2', 'M16 12.5v2', 'M3 21h18',
  ],
  // Torre de muralla medieval
  nuremberg: [
    'M8 21V9h8v12', 'M7 9l5-6 5 6', 'M10 21v-3a2 2 0 0 1 4 0v3', 'M12 11.5v2',
    'M3 21v-6h5', 'M16 15h5v6', 'M3 15v-1.5h1.5V15', 'M19.5 15v-1.5H21V15', 'M2 21h20',
  ],
  rothenburg: 'nuremberg',
  // Casa de entramado
  bamberg: [
    'M3.5 11.5 12 4l8.5 7.5', 'M5 10.5V21h14V10.5', 'M5 14.5h14',
    'M5 10.5l4 4', 'M19 10.5l-4 4', 'M12 7.5v7', 'M8.5 17.5v2', 'M15.5 17.5v2',
    'M11 21v-3.5h2V21', 'M2.5 21h19',
  ],
  // Big Ben y el Parlamento
  london: [
    'M9.5 21V9h5v12', 'M9 9h6', 'M10 9V6.5h4V9', 'M10 6.5l2-4 2 4', { cx: 12, cy: 12, r: 1.6 },
    'M3 21v-6h6.5', 'M14.5 15H21v6', 'M5 17.5V19', 'M7.5 17.5V19', 'M16.5 17.5V19', 'M19 17.5V19',
    'M2 21h20',
  ],
  // Puerta de Alcalá
  madrid: [
    'M3 21V9h18v12', 'M8 9V6.5h8V9', 'M11 6.5l1-1.5 1 1.5',
    'M5 21v-5a2 2 0 0 1 4 0v5', 'M10 21v-6a2 2 0 0 1 4 0v6', 'M15 21v-5a2 2 0 0 1 4 0v5', 'M2 21h20',
  ],
  // Sagrada Familia
  barcelona: [
    'M4.5 21v-10l1.5-5 1.5 5v10', 'M8.5 21V8l1.5-5 1.5 5v13', 'M12.5 21V8l1.5-5 1.5 5v13',
    'M16.5 21v-10l1.5-5 1.5 5v10', 'M6 13v1.5', 'M10 11v1.5', 'M14 11v1.5', 'M18 13v1.5', 'M3 21h18',
  ],
  // Coliseo
  rome: [
    'M3 8.5C5 6.9 8.5 6 12 6s7 .9 9 2.5V20H3z', 'M3 12.5h18', 'M3 16.5h18',
    'M6 12.5V20', 'M9 12.5V20', 'M12 12.5V20', 'M15 12.5V20', 'M18 12.5V20',
    'M7 8v4.5', 'M12 7v5.5', 'M17 8v4.5',
  ],
  // Góndola
  venice: [
    'M3 15c3.5 2.5 12.5 2.5 17-1.5', 'M20 13.5l1.5-2', 'M3 15l-.5-1.5', 'M13.5 6l-2 10', 'M11 6h5', WAVE,
  ],
  // Torre del Puente de Carlos
  prague: [
    'M8.5 21V9h7v12', 'M8 9l4-6.5L16 9', 'M8.5 9V7.5', 'M15.5 9V7.5', 'M10.5 21v-3a1.5 1.5 0 0 1 3 0v3',
    'M12 12v2', 'M2 16.5h6.5', 'M15.5 16.5H22', 'M3 21a2.5 2.5 0 0 1 5 0', 'M16 21a2.75 2.75 0 0 1 5.5 0',
  ],
  // Noria del Prater
  vienna: [
    { cx: 12, cy: 10, r: 7 }, { cx: 12, cy: 10, r: 1 }, 'M5 10h6', 'M13 10h6', 'M12 3v6', 'M12 11v6',
    'M7 5l4.3 4.3', 'M17 15l-4.3-4.3', 'M17 5l-4.3 4.3', 'M7 15l4.3-4.3',
    'M11.4 10.9 7.5 21', 'M12.6 10.9 16.5 21', 'M5 21h14',
  ],
  // Rascacielos
  frankfurt: [
    'M4 21v-9h4v9', 'M8 21V6h4.5v15', 'M10.25 6V3.5', 'M12.5 21V9.5l3.5-2V21', 'M16 21v-7h4v7',
    'M10 9.5h.5', 'M10 13h.5', 'M10 16.5h.5', 'M6 15h.5', 'M18 17h.5', 'M2.5 21h19',
  ],
  // Ángel de la Independencia
  metropolis: [
    'M7 21h10', 'M8 21v-2h8v2', 'M9.5 19v-2h5v2', 'M11 17V7h2v10', 'M10.5 7h3', 'M12 7V5',
    'M12 5c-1.5-.4-2.5-1.5-2.8-3', 'M12 5c1.5-.4 2.5-1.5 2.8-3', { cx: 12, cy: 3.2, r: 0.8 },
  ],
  // Ciudad genérica
  generic: [
    'M4 21V10h5v11', 'M9 21V5h6v16', 'M15 21v-8h5v8', 'M11.5 8h1', 'M11.5 11h1', 'M11.5 14h1',
    'M11.5 17h1', 'M6 13h1', 'M6 16h1', 'M17 16h1', 'M2.5 21h19',
  ],
});

/** Trazos del icono de una ciudad; las entradas de texto son alias de otra ciudad. */
export function cityLandmarkShapes(kind) {
  const entry = CITY_LANDMARK_ICONS[kind] ?? CITY_LANDMARK_ICONS.generic;
  return typeof entry === 'string' ? CITY_LANDMARK_ICONS[entry] : entry;
}
