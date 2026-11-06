/**
 * Monumentos emblemáticos dibujados para Atlas, en el mismo estilo plano de tres
 * tonos que los iconos por tipo de ciudad. Solo para ciudades con un emblema
 * reconocible; el resto usa un icono genérico (ver `cityTypeIcons.js`).
 */
import { GROUND, WAVE_LINE, arch, bar, circle, crenel, r, windows } from './cityIconShapes.js';

const n = (value) => Number(value.toFixed(2));
const range = (count, map) => Array.from({ length: count }, (_, index) => map(index));

// Aguja de la Sagrada Familia: cono alto con punta redondeada.
const spire = (x, w, top) => `M${x} 39.5L${n(x + w * 0.2)} ${top + 5}Q${n(x + w / 2)} ${n(top - 1.6)} ${n(x + w * 0.8)} ${top + 5}L${n(x + w)} 39.5z`;
// Alero curvo de pagoda.
const eave = (cx, y, w) => `M${n(cx - w / 2)} ${y}q${n(w * 0.1)}-.8 ${n(w * 0.18)}-2.2h${n(w * 0.64)}q${n(w * 0.08)} 1.4 ${n(w * 0.18)} 2.2z`;

const RIESENRAD_CABINS = range(12, (index) => {
  const angle = (index / 12) * Math.PI * 2;
  return r(24 + Math.cos(angle) * 14.6 - 1.5, 19.5 + Math.sin(angle) * 14.6 - 1.1, 3, 2.2, 0.6);
}).join('');
const RIESENRAD_SPOKES = range(8, (index) => {
  const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
  return bar(24 + Math.cos(angle) * 1.6, 19.5 + Math.sin(angle) * 1.6, 24 + Math.cos(angle) * 12.6, 19.5 + Math.sin(angle) * 12.6, 0.8);
});

export const CITY_EMBLEM_ICONS = Object.freeze({
  // París: Torre Eiffel.
  eiffel: [
    { tone: 'soft', d: circle(8.5, 36.4, 3.6) + circle(39.5, 36.4, 3.6) },
    { tone: 'mid', d: 'M16.2 30.5H31.8C32.5 34.2 34.5 37.3 37.6 39.5H30.4C29.8 35.9 27.3 33.6 24 33.6S18.2 35.9 17.6 39.5H10.4C13.5 37.3 15.5 34.2 16.2 30.5Z' },
    { tone: 'mid', d: 'M20.5 20.6H27.5C27.9 23.8 28.9 26.2 30.3 28.2H17.7C19.1 26.2 20.1 23.8 20.5 20.6Z' },
    { tone: 'mid', d: 'M22.9 9.5H25.1L26.4 18.6H21.6Z' },
    { tone: 'deep', d: 'M24 33.6C27.3 33.6 29.8 35.9 30.4 39.5H37.6C34.5 37.3 32.5 34.2 31.8 30.5H24ZM24 20.6H27.5C27.9 23.8 28.9 26.2 30.3 28.2H24ZM24 9.5H25.1L26.4 18.6H24Z' },
    { tone: 'deep', d: r(14.6, 28, 18.8, 2.6, 0.9) + r(19.6, 18.4, 8.8, 2.3, 0.8) + r(22.4, 7.6, 3.2, 2, 0.6) },
    { tone: 'deep', d: r(23.35, 3, 1.3, 5, 0.65) },
    GROUND,
  ],
  // Berlín: Puerta de Brandeburgo.
  brandenburg: [
    { tone: 'soft', d: r(4.5, 25.5, 5.5, 14, 0.8) + r(38, 25.5, 5.5, 14, 0.8) },
    { tone: 'mid', d: r(16, 12.4, 16, 4, 0.6) },
    { tone: 'deep', d: r(19.6, 9.4, 8.8, 3, 1) + r(18.8, 7.6, 2.2, 1.8, 0.9) + r(27, 7.6, 2.2, 1.8, 0.9) },
    { tone: 'deep', d: r(23.3, 3.6, 1.4, 5.8, 0.7) },
    { tone: 'deep', d: r(7, 16.4, 34, 2.2, 0.8) },
    { tone: 'mid', d: r(8, 18.6, 32, 2.8) },
    { tone: 'mid', d: range(6, (index) => r(8.4 + index * 5.72, 21, 2.6, 15.6)).join('') },
    { tone: 'white', d: range(5, (index) => r(11.6 + index * 5.72, 19.5, 2.52, 1)).join('') },
    { tone: 'deep', d: r(7, 36.4, 34, 3.4, 0.6) },
    GROUND,
  ],
  // Ámsterdam: casas de canal con sus frontones.
  canalHouses: [
    { tone: 'soft', d: 'M6.5 35.5V22h2v-3h2v-3h4v3h2v3h2v13.5z' },
    { tone: 'deep', d: 'M18.5 35.5V17.5c0-1.4 1.2-2.2 2.4-2.2 0-3.4 1.4-6 3.35-7.3 1.95 1.3 3.35 3.9 3.35 7.3 1.2 0 2.4.8 2.4 2.2v18z' },
    { tone: 'mid', d: 'M30 35.5V21.5h2.75v-5l3-3 3 3v5h2.75v14z' },
    { tone: 'white', d: windows([[9.4, 24], [13.2, 24], [9.4, 29.2], [13.2, 29.2], [11.3, 18.6]], 2.4, 2.8)
      + windows([[21.4, 19.2], [24.7, 19.2], [21.4, 24.2], [24.7, 24.2], [21.4, 29.2], [24.7, 29.2]], 2.4, 2.8)
      + circle(24.25, 13.2, 1.2)
      + windows([[32.9, 23.4], [36.2, 23.4], [32.9, 28.4], [36.2, 28.4], [34.55, 17.4]], 2.4, 2.8) },
    { tone: 'white', d: r(5, 34.8, 38, 1.1, 0.55) },
    { tone: 'mid', d: r(5, 35.9, 38, 6.1, 1.6) },
    { tone: 'wave', d: WAVE_LINE(39.4) },
  ],
  // Brujas: el Belfort sobre la plaza.
  belfry: [
    { tone: 'soft', d: 'M5 39.5V27h2v-2.5h2V22h3v2.5h2V27h2v12.5zM32 39.5V27h2v-2.5h2V22h3v2.5h2V27h2v12.5z' },
    { tone: 'white', d: windows([[8.2, 30], [11.4, 30], [35.2, 30], [38.4, 30]], 1.8, 2.6) },
    { tone: 'mid', d: r(18.5, 18, 11, 21.5, 0.6) },
    { tone: 'deep', d: r(19.8, 9.8, 8.4, 8.4, 0.6) + r(17.6, 15.4, 2.2, 3.2, 0.6) + r(28.2, 15.4, 2.2, 3.2, 0.6) },
    { tone: 'mid', d: r(21, 4.8, 6, 5, 1) },
    { tone: 'deep', d: 'M21.4 5 24 1.6 26.6 5z' },
    { tone: 'white', d: circle(24, 14, 1.9) + arch(20.9, 30, 2.2, 7) + arch(24.9, 30, 2.2, 7) + arch(22.3, 39.5, 3.4, 5.5) },
    GROUND,
  ],
  // Gante: castillo de Gravensteen.
  castle: [
    { tone: 'soft', d: crenel(5, 26, 38, 39.5, 9) },
    { tone: 'mid', d: crenel(7, 18, 8, 39.5, 3) + crenel(33, 18, 8, 39.5, 3) },
    { tone: 'deep', d: crenel(17, 10, 14, 39.5, 4) },
    { tone: 'white', d: arch(21.5, 39.5, 5, 8) + r(23.3, 14.6, 1.4, 4.4, 0.7) + r(19.8, 23, 1.4, 3.6, 0.7) + r(26.8, 23, 1.4, 3.6, 0.7)
      + r(10.3, 23.6, 1.4, 3.8, 0.7) + r(36.3, 23.6, 1.4, 3.8, 0.7) },
    GROUND,
  ],
  // Colonia: la catedral y sus dos agujas.
  twinSpires: [
    { tone: 'soft', d: r(4.5, 30, 6.5, 9.5, 0.8) + r(37, 30, 6.5, 9.5, 0.8) },
    { tone: 'mid', d: 'M18.5 39.5V25l5.5-6 5.5 6v14.5z' },
    { tone: 'deep', d: 'M11 39.5V17l3.75-13 3.75 13v22.5zM29.5 39.5V17l3.75-13 3.75 13v22.5z' },
    { tone: 'white', d: arch(13.75, 30, 2, 7.5) + arch(32.25, 30, 2, 7.5) + r(13.95, 18.6, 1.6, 3.4, 0.8) + r(32.45, 18.6, 1.6, 3.4, 0.8)
      + circle(24, 27.4, 2) + arch(22.2, 39.5, 3.6, 6.4) },
    GROUND,
  ],
  // Londres: la torre del reloj.
  clockTower: [
    { tone: 'soft', d: r(29.5, 25, 13.5, 14.5, 0.6) + r(30.2, 22.4, 1.4, 2.6, 0.5) + r(35.6, 22.4, 1.4, 2.6, 0.5) + r(41, 22.4, 1.4, 2.6, 0.5) },
    { tone: 'white', d: windows([[32, 28.4], [35.4, 28.4], [38.8, 28.4], [32, 33.4], [35.4, 33.4], [38.8, 33.4]], 1.6, 3) },
    { tone: 'soft', d: circle(9.5, 35.2, 4.3) },
    { tone: 'mid', d: r(19.5, 17, 9, 22.5, 0.4) },
    { tone: 'deep', d: r(18.4, 10.6, 11.2, 7, 1) },
    { tone: 'mid', d: r(19.6, 7.6, 8.8, 3.2, 0.6) },
    { tone: 'deep', d: 'M19.6 7.8 24 2l4.4 5.8z' },
    { tone: 'white', d: circle(24, 14.1, 2.6) + r(21.6, 20.4, 1.4, 5, 0.7) + r(25, 20.4, 1.4, 5, 0.7) + r(21.6, 28.4, 1.4, 5, 0.7) + r(25, 28.4, 1.4, 5, 0.7) },
    { tone: 'deep', d: 'M23.55 14.4v-2.3h.9v1.95l1.2.75-.45.7z' },
    GROUND,
  ],
  // Roma: el Coliseo.
  colosseum: [
    { tone: 'mid', d: 'M5 39.5V20.5c3.8-2.6 11.2-4.4 19-4.4 5.6 0 10.6.8 14 2V22l2.5 1v2.5l2.5.8v13.2z' },
    { tone: 'deep', d: 'M24 16.1c5.6 0 10.6.8 14 2V22l2.5 1v2.5l2.5.8v13.2H24z' },
    { tone: 'soft', d: r(5, 26.6, 38, 1.3) + r(5, 32.6, 38, 1.3) + r(5, 21.2, 33, 1.2) },
    { tone: 'white', d: range(8, (index) => arch(6.9 + index * 4.4, 39.5, 2.6, 4.6)).join('')
      + range(8, (index) => arch(6.9 + index * 4.4, 31.9, 2.6, 3.6)).join('')
      + range(7, (index) => arch(6.9 + index * 4.4, 25.9, 2.6, 3.2)).join('') },
    GROUND,
  ],
  // Nueva York: rascacielos art déco escalonado.
  artDecoTower: [
    { tone: 'soft', d: r(5, 24, 7, 15.5, 0.8) + r(12.6, 30, 4.4, 9.5, 0.6) + r(31, 27, 6, 12.5, 0.6) + r(37.6, 21, 5.4, 18.5, 0.8) },
    { tone: 'mid', d: 'M16.5 39.5V28H18.5V19H21V12H22.6V8.5H25.4V12H27V19H29.5V28H31.5V39.5Z' },
    { tone: 'deep', d: 'M24 39.5V8.5H25.4V12H27V19H29.5V28H31.5V39.5Z' },
    { tone: 'deep', d: r(23.4, 2.5, 1.2, 6.4, 0.6) },
    { tone: 'soft', d: r(19.6, 20.5, 1, 17.5, 0.5) + r(22.2, 13.5, 1, 24.5, 0.5) + r(24.8, 13.5, 1, 24.5, 0.5) + r(27.4, 20.5, 1, 17.5, 0.5) },
    { tone: 'white', d: windows([[7, 27], [9.2, 27], [7, 31], [9.2, 31], [39.2, 24], [39.2, 28], [39.2, 32]], 1.4, 2) },
    GROUND,
  ],
  // Ciudad de México: el Ángel de la Independencia.
  victoryColumn: [
    { tone: 'soft', d: circle(8.5, 35.4, 4.2) + circle(39.5, 35.4, 4.2) },
    { tone: 'mid', d: r(22.4, 13, 3.2, 20, 0.4) },
    { tone: 'deep', d: 'M14 39.5v-3h3V33h14v3.5h3v3z' },
    { tone: 'deep', d: r(21, 11.2, 6, 2, 0.6) + r(21.4, 30.8, 5.2, 2.2, 0.4) },
    { tone: 'white', d: r(22.4, 22, 3.2, 0.9) + r(19.6, 34.4, 8.8, 0.9, 0.45) },
    { tone: 'mid', d: 'M24 10.4c-2.8-.4-5.8-2.6-7.2-5.8 2.8.3 5.4 1.6 7.2 3.8 1.8-2.2 4.4-3.5 7.2-3.8-1.4 3.2-4.4 5.4-7.2 5.8z' },
    { tone: 'deep', d: r(23.1, 6.2, 1.8, 5, 0.9) + circle(24, 4.6, 1.15) },
    GROUND,
  ],
  // Barcelona: la Sagrada Familia.
  basilicaSpires: [
    { tone: 'soft', d: spire(5.5, 4.5, 18) + spire(38, 4.5, 18) },
    { tone: 'mid', d: spire(10, 5, 10) + spire(15.4, 5, 6.5) + spire(27.6, 5, 6.5) + spire(33, 5, 10) },
    { tone: 'deep', d: spire(20.6, 6.8, 2) },
    { tone: 'mid', d: r(9, 31, 30, 8.5, 0.6) },
    { tone: 'white', d: windows([[11.9, 19], [11.9, 24], [17.3, 15.5], [17.3, 21], [29.5, 15.5], [29.5, 21], [34.9, 19], [34.9, 24]], 1.2, 2.2)
      + windows([[23.4, 12], [23.4, 18], [23.4, 24]], 1.2, 2.6)
      + arch(13, 39.5, 3, 5) + arch(22.3, 39.5, 3.4, 6) + arch(32, 39.5, 3, 5) },
    GROUND,
  ],
  // Múnich: torres con cúpulas de la Frauenkirche.
  domedTowers: [
    { tone: 'soft', d: 'M8 39.5V26l16-8 16 8v13.5z' },
    { tone: 'mid', d: r(13.6, 15, 7.4, 24.5, 0.5) + r(27, 15, 7.4, 24.5, 0.5) },
    { tone: 'deep', d: 'M13.4 15a3.9 4.4 0 0 1 7.8 0zM26.8 15a3.9 4.4 0 0 1 7.8 0z' + r(16.6, 8.4, 1.4, 2.2, 0.6) + r(30, 8.4, 1.4, 2.2, 0.6)
      + circle(17.3, 7.4, 0.9) + circle(30.7, 7.4, 0.9) },
    { tone: 'deep', d: r(13, 22.4, 8.6, 1.4, 0.4) + r(26.4, 22.4, 8.6, 1.4, 0.4) },
    { tone: 'white', d: circle(17.3, 18.6, 1.5) + circle(30.7, 18.6, 1.5) + arch(16.4, 32, 1.8, 6) + arch(29.8, 32, 1.8, 6) + arch(22.6, 39.5, 2.8, 5) },
    GROUND,
  ],
  // Praga: torre gótica del puente.
  bridgeTower: [
    { tone: 'soft', d: 'M6.5 29V19.5l2-5 2 5V29zM37.5 29V19.5l2-5 2 5V29z' },
    { tone: 'mid', d: r(18.5, 14, 11, 16) },
    { tone: 'deep', d: 'M17.4 14.6 24 3l6.6 11.6z' + 'M17.2 14.8v-3.4l.8-1.8.8 1.8v3.4zM29.2 14.8v-3.4l.8-1.8.8 1.8v3.4z' },
    { tone: 'deep', d: 'M4 29h40v7h-2.2a5.2 4.8 0 0 0-10.4 0H16.6a5.2 4.8 0 0 0-10.4 0H4z' },
    { tone: 'white', d: arch(21.6, 36, 4.8, 9) + r(20.6, 16.6, 1.6, 2.8, 0.6) + r(25.8, 16.6, 1.6, 2.8, 0.6) },
    { tone: 'mid', d: r(4, 36.4, 40, 5.6, 1.6) },
    { tone: 'wave', d: WAVE_LINE(39.6) },
  ],
  // Viena: la noria del Prater.
  ferrisWheel: [
    { tone: 'soft', d: r(8, 33.5, 32, 6, 0.8) },
    { tone: 'mid', d: circle(24, 19.5, 14) + circle(24, 19.5, 12.5) },
    { tone: 'mid', d: RIESENRAD_SPOKES.join('') },
    { tone: 'deep', d: 'M24 21.5 15 39.5h2.8L24 26.8l6.2 12.7H33z' },
    { tone: 'deep', d: circle(24, 19.5, 2.2) + RIESENRAD_CABINS },
    { tone: 'white', d: windows([[11, 35.6], [14.4, 35.6], [31.2, 35.6], [34.6, 35.6]], 2.2, 2) },
    GROUND,
  ],
  // Venecia: góndola frente al campanario.
  gondola: [
    { tone: 'soft', d: r(5, 20, 10, 12, 0.6) + r(15.6, 24, 7, 8, 0.6) + r(31, 9.4, 5, 22.6, 0.4) },
    { tone: 'soft', d: 'M30.6 9.6 33.5 4.4l2.9 5.2z' },
    { tone: 'white', d: windows([[7, 23], [10.8, 23], [7, 27.4], [10.8, 27.4], [17.6, 27]], 1.8, 2.6) + r(32.4, 12.4, 2.2, 3, 0.6) },
    { tone: 'mid', d: r(4, 31.5, 40, 10.5, 1.6) },
    { tone: 'wave', d: WAVE_LINE(39.8) },
    { tone: 'deep', d: 'M6 29.5c4.6 3 11 4.2 18 4.2s13.4-1.2 18-4.2c-1 2.6-2.6 4.2-5 5.2-3.8.8-8.4 1.2-13 1.2s-9.2-.4-13-1.2C8.6 33.7 7 32.1 6 29.5z' },
    { tone: 'deep', d: 'M40.6 30.4l1.8-5.6 1.4.4-1.4 4.8z' + circle(13.2, 19.2, 1.3) + r(12.2, 21, 2, 9, 1) },
    { tone: 'deep', d: bar(12.4, 23.4, 18.4, 35.4, 0.8) },
  ],
  // Sídney: la ópera y sus velas.
  operaShells: [
    { tone: 'deep', d: r(6, 29.6, 36, 3.6, 0.6) },
    { tone: 'soft', d: 'M8.4 29.6c.6-5.2 3.4-9.2 8-10.8-1 3.6-.8 7.4.6 10.8zM15.6 29.6c.8-7.2 4.6-12.4 11-14.8-1.6 4.8-1.2 10 1 14.8zM25.6 29.6c.8-8.4 5.2-14.4 12.6-17-1.8 5.6-1.4 11.4 1.2 17z' },
    { tone: 'white', d: 'M16.4 18.8c-1 3.6-.8 7.4.6 10.8h2.2c-1.6-3.4-2.4-7-2.8-10.8zM26.6 14.8c-1.6 4.8-1.2 10 1 14.8h2.4c-2-4.6-3-9.6-3.4-14.8zM38.2 12.6c-1.8 5.6-1.4 11.4 1.2 17h2.4c-2.4-5.4-3.4-11-3.6-17z' },
    { tone: 'mid', d: r(4, 33.2, 40, 8.8, 1.6) },
    { tone: 'wave', d: WAVE_LINE(38.6) },
  ],
  // Río de Janeiro: el Cristo sobre el cerro.
  summitStatue: [
    { tone: 'soft', d: 'M3 39.5 12 29l3.4 2.6L19 27l7 12.5z' },
    { tone: 'mid', d: 'M9 39.5 16.4 30l2.6 1.4 1.6-9.8c1-.8 2.2-.8 3 0L26 29l3-1.6 2.4 3L39 39.5z' },
    { tone: 'deep', d: 'M22.1 21.2c.6 0 1.1.1 1.5.4L26 29l3-1.6 2.4 3L39 39.5H25.4l-1-6.2-2.3-3.4z' },
    { tone: 'deep', d: r(20.3, 18.6, 3.6, 2.4, 0.4) },
    { tone: 'deep', d: 'M12.6 10.2h19v1.6l-7.2.8.8 6.2h-6.2l.8-6.2-7.2-.8z' + circle(22.1, 8.2, 1.4) },
    GROUND,
  ],
  // Atenas: el Partenón sobre la colina.
  temple: [
    { tone: 'soft', d: 'M3 39.5c4-6 8-8.6 13-9h16c5 .4 9 3 13 9z' },
    { tone: 'deep', d: 'M9.6 18.4 24 10.6l14.4 7.8z' + r(10, 18.4, 28, 2.6, 0.4) },
    { tone: 'white', d: 'M14.6 17.2 24 12.2l9.4 5z' },
    { tone: 'mid', d: range(7, (index) => r(n(11 + index * 3.97), 21, 2.2, 8.4)).join('') },
    { tone: 'deep', d: r(9, 29.4, 30, 1.8, 0.4) },
    GROUND,
  ],
  // Dubái: la torre más alta del mundo.
  needleTower: [
    { tone: 'soft', d: r(6, 28, 6, 11.5, 0.8) + r(12.6, 32, 5, 7.5, 0.6) + r(31, 30, 5, 9.5, 0.6) + r(36.6, 25, 6, 14.5, 0.8) },
    { tone: 'mid', d: 'M19.5 39.5V30l1.5-.8V22l1.2-.6V14l.9-.5V6.5L24 1.5l.9 5v7l.9.5v7.4l1.2.6v7.2l1.5.8v9.5z' },
    { tone: 'deep', d: 'M24 39.5V1.5l.9 5v7l.9.5v7.4l1.2.6v7.2l1.5.8v9.5z' },
    { tone: 'white', d: windows([[7.8, 30.6], [7.8, 34.6], [38.4, 27.6], [38.4, 31.6], [38.4, 35.6]], 2.4, 1.6) },
    GROUND,
  ],
  // San Francisco: puente colgante.
  suspensionBridge: [
    { tone: 'deep', d: 'M4 20.4c4 1.6 7.4 2 10.2-12.4 3.6 9.6 8.6 14.2 9.8 14.2s6.2-4.6 9.8-14.2c2.8 14.4 6.2 14 10.2 12.4', stroke: 1 },
    { tone: 'deep', d: [8, 18, 21, 24, 27, 30, 40].map((x) => `M${x} ${x === 8 || x === 40 ? 22.4 : x === 24 ? 22.4 : 18.6}V26.6`).join(''), stroke: 0.5 },
    { tone: 'deep', d: r(12.6, 8, 3.4, 28, 0.4) + r(32, 8, 3.4, 28, 0.4) },
    { tone: 'white', d: r(13.6, 11, 1.4, 5, 0.4) + r(13.6, 18.4, 1.4, 6, 0.4) + r(33, 11, 1.4, 5, 0.4) + r(33, 18.4, 1.4, 6, 0.4) },
    { tone: 'deep', d: r(4, 26.4, 40, 2.4, 0.6) },
    { tone: 'mid', d: r(4, 33.5, 40, 8.5, 1.6) },
    { tone: 'wave', d: WAVE_LINE(38.6) },
  ],
  // Pagoda: varios aleros curvos; sirve para ciudades de Asia oriental.
  pagoda: [
    { tone: 'soft', d: circle(8.5, 34.6, 4.4) + circle(39.5, 34.6, 4.4) },
    { tone: 'mid', d: r(17.5, 31, 13, 8.5) + r(18.8, 24.6, 10.4, 4.6) + r(20, 18.4, 8, 4.4) + r(21.2, 12.4, 5.6, 4.2) },
    { tone: 'deep', d: eave(24, 31.4, 22) + eave(24, 25, 18) + eave(24, 18.8, 14.4) + eave(24, 12.8, 11) },
    { tone: 'deep', d: r(23.4, 3, 1.2, 7.8, 0.6) + r(22.2, 6, 3.6, 1, 0.5) + r(22.2, 8, 3.6, 1, 0.5) },
    { tone: 'white', d: arch(22.2, 39.5, 3.6, 5.4) + windows([[20.4, 25.8], [26, 25.8], [22.8, 19.6]], 1.6, 2) },
    GROUND,
  ],
});

/** Monumento por ciudad (nombres sin acentos, en minúsculas, en varios idiomas). */
export const CITY_EMBLEM_BY_NAME = Object.freeze({
  paris: 'eiffel',
  berlin: 'brandenburg',
  amsterdam: 'canalHouses',
  brujas: 'belfry', bruges: 'belfry', brugge: 'belfry',
  gante: 'castle', ghent: 'castle', gent: 'castle', gand: 'castle',
  colonia: 'twinSpires', cologne: 'twinSpires', koln: 'twinSpires', koeln: 'twinSpires',
  londres: 'clockTower', london: 'clockTower',
  roma: 'colosseum', rome: 'colosseum',
  'nueva york': 'artDecoTower', 'new york': 'artDecoTower', 'new york city': 'artDecoTower', nyc: 'artDecoTower', manhattan: 'artDecoTower',
  'ciudad de mexico': 'victoryColumn', 'mexico city': 'victoryColumn', cdmx: 'victoryColumn', 'mexico df': 'victoryColumn',
  barcelona: 'basilicaSpires',
  munich: 'domedTowers', munchen: 'domedTowers', muenchen: 'domedTowers', 'monaco de baviera': 'domedTowers',
  praga: 'bridgeTower', prague: 'bridgeTower', praha: 'bridgeTower',
  viena: 'ferrisWheel', vienna: 'ferrisWheel', wien: 'ferrisWheel',
  venecia: 'gondola', venice: 'gondola', venezia: 'gondola',
  sidney: 'operaShells', sydney: 'operaShells',
  'rio de janeiro': 'summitStatue', rio: 'summitStatue',
  atenas: 'temple', athens: 'temple', athina: 'temple',
  dubai: 'needleTower',
  'san francisco': 'suspensionBridge',
});
