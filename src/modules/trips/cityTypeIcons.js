/**
 * Iconos propios de Atlas por tipo de ciudad (no por monumento): sirven para
 * cualquier ciudad del mundo y varias ciudades pueden compartir uno.
 *
 * Lienzo 48 × 48, formas rellenas en tres tonos del color de la parada:
 *   - `mid`: el color de la parada;
 *   - `deep`: el color oscurecido, para volúmenes y sombras;
 *   - `soft`: el color aclarado, para planos de fondo;
 *   - `white`: luces, ventanas y espuma.
 * El fondo de la miniatura es el color muy aclarado (`tint`).
 */

const r = (x, y, w, h, rx = 0) => `M${x + rx} ${y}h${w - 2 * rx}${rx ? `a${rx} ${rx} 0 0 1 ${rx} ${rx}` : ''}v${h - 2 * rx}${rx ? `a${rx} ${rx} 0 0 1 -${rx} ${rx}` : ''}h-${w - 2 * rx}${rx ? `a${rx} ${rx} 0 0 1 -${rx} -${rx}` : ''}v-${h - 2 * rx}${rx ? `a${rx} ${rx} 0 0 1 ${rx} -${rx}` : ''}z`;
const windows = (positions, w = 2.4, h = 3) => positions.map(([x, y]) => r(x, y, w, h, 0.6)).join('');
// Ola suave que cabe dentro del agua (x de 9 a 39).
const WAVE_LINE = (y) => `M9 ${y}${'c1.9 0 1.9-1.5 3.75-1.5s1.9 1.5 3.75 1.5'.repeat(4)}`;

export const CITY_TYPE_ICONS = Object.freeze({
  // Ciudad: el icono por defecto, un barrio con cúpula, torre y casas.
  city: [
    { tone: 'soft', d: 'M9 40V24a6 6 0 0 1 12 0v16z' },
    { tone: 'deep', d: r(19, 12, 10, 28, 1.5) },
    { tone: 'mid', d: 'M27 40V25l6.5-5.5L40 25v15z' },
    { tone: 'mid', d: r(8, 31, 13, 9, 1) },
    { tone: 'white', d: windows([[22, 16], [25.6, 16], [22, 21.5], [25.6, 21.5], [22, 27], [25.6, 27]]) + windows([[31, 29], [35.4, 29]]) + windows([[11, 34], [16, 34]], 2.4, 2.6) },
    { tone: 'deep', d: r(6, 39.5, 36, 2.5, 1.25) },
  ],
  // Casco antiguo: tejados a dos aguas y un campanario.
  oldTown: [
    { tone: 'soft', d: 'M7 40V26l6-6 6 6v14z' },
    { tone: 'mid', d: 'M17 40V20h14v20z' },
    { tone: 'deep', d: 'M16 21 24 7l8 14z' },
    { tone: 'soft', d: 'M29 40V28l6-5.5 6 5.5v12z' },
    { tone: 'deep', d: 'M5.8 27 13 19.6l7.2 7.4h-2.4L13 22.2 8.2 27zM27.8 29l7.2-7 7.2 7h-2.4L35 24.6 30.2 29z' },
    { tone: 'white', d: 'M24 28a2.4 2.4 0 1 0 0-4.8a2.4 2.4 0 1 0 0 4.8zM21.6 40v-5a2.4 2.4 0 0 1 4.8 0v5z' + windows([[11.8, 30], [11.8, 35], [33.8, 31.5]], 2.4, 2.8) },
    { tone: 'deep', d: r(5, 39.5, 38, 2.5, 1.25) },
  ],
  // Metrópoli: rascacielos de distintas alturas.
  metropolis: [
    { tone: 'soft', d: r(7, 22, 9, 18, 1.2) },
    { tone: 'deep', d: r(17, 8, 10, 32, 1.2) },
    { tone: 'deep', d: r(21, 4, 2, 5, 1) },
    { tone: 'mid', d: 'M28 40V15.5l7-3.5v28z' },
    { tone: 'soft', d: r(36, 26, 6, 14, 1.2) },
    { tone: 'white', d: [12, 16, 20, 24, 28, 32].map((y) => r(19.4, y, 5.2, 1.6, 0.8)).join('') + [26, 31, 36].map((y) => r(9.5, y, 4, 1.4, 0.7)).join('') + [19, 24, 29, 34].map((y) => r(30, y, 3, 1.4, 0.7)).join('') },
    { tone: 'deep', d: r(5, 39.5, 38, 2.5, 1.25) },
  ],
  // Ciudad de agua: puente en arco sobre un canal o río.
  waterfront: [
    { tone: 'soft', d: 'M8 25V16.5l4.5-4 4.5 4V25zM31 25V15l4.5-4 4.5 4v10z' },
    { tone: 'mid', d: 'M16.5 25V10.5h15V25z' },
    { tone: 'white', d: windows([[19.6, 13.6], [25.8, 13.6], [19.6, 18.6], [25.8, 18.6]]) },
    { tone: 'deep', d: 'M5 24h38v9h-4.6a14.4 7 0 0 0-28.8 0H5z' },
    { tone: 'mid', d: r(5, 33, 38, 9, 1.6) },
    { tone: 'wave', d: WAVE_LINE(36.6) },
    { tone: 'wave', d: WAVE_LINE(40) },
  ],
  // Costa: sol sobre el mar y una vela.
  coast: [
    { tone: 'soft', d: 'M24 31a10 10 0 1 1 0-20a10 10 0 1 1 0 20z' },
    { tone: 'deep', d: 'M30 30V12l8 18z' },
    { tone: 'mid', d: 'M28.5 30V16l-6 14z' },
    { tone: 'deep', d: 'M20 31h21l-2.5 3.5h-16z' },
    { tone: 'mid', d: r(5, 34, 38, 8, 1.6) },
    { tone: 'wave', d: WAVE_LINE(38) },
  ],
  // Montaña: dos cumbres con nieve.
  mountain: [
    { tone: 'soft', d: 'M4 40 17 17l13 23z' },
    { tone: 'deep', d: 'M16 40l14.5-27L45 40z' },
    { tone: 'white', d: 'M25.2 22.8 30.5 13l5.3 9.8-2.6-1.6-2.7 2.2-2.6-2.2zM13.4 21.6 17 17l3.6 4.6-1.8-.9-1.8 1.4-1.8-1.4z' },
    { tone: 'mid', d: 'M3 40h42v2H3z' },
  ],
  // Lago: montañas suaves y su reflejo en el agua.
  lake: [
    { tone: 'soft', d: 'M5 30l10-13 7 8 6-6 15 11z' },
    { tone: 'deep', d: 'M14 30l9.5-12L33 30z' },
    { tone: 'white', d: 'M20.5 21.8 23.5 18l3 3.8-1.5-.8-1.5 1-1.5-1z' },
    { tone: 'mid', d: r(4, 31, 40, 11, 1.6) },
    { tone: 'white', d: r(10, 34, 12, 1.6, 0.8) + r(25, 37.5, 10, 1.6, 0.8) + r(14, 40, 6, 1.4, 0.7) },
  ],
  // Trópico: palmera en una isla.
  tropical: [
    { tone: 'soft', d: 'M36 18a6 6 0 1 1 0-12a6 6 0 1 1 0 12z' },
    { tone: 'deep', d: 'M21.6 36c.6-7 2.4-13 6-18l1.8 1.1c-3.2 4.8-4.8 10.4-5.4 16.9z' },
    { tone: 'mid', d: 'M28.4 18.4c-3-4.2-8.6-5-13.4-2.4 4.6.2 8.6 1.4 11.6 4zM28.6 18.2c.4-5.2 5.2-8.4 10.4-7.8-3.8 1.6-6.8 4.2-8.6 8.4zM28.8 18.6c4.6-1.2 9.2 1.4 10.6 6-2.8-2.4-6-3.6-9.8-3.4zM28.2 18.8c-4.4 1-7.2 5-6.8 9.6 1.4-3.4 3.8-5.8 7.6-7.2z' },
    { tone: 'deep', d: 'M10 37c4-3 9.5-4.5 14-4.5S34 34 38 37z' },
    { tone: 'mid', d: r(5, 36, 38, 6, 1.6) },
    { tone: 'wave', d: WAVE_LINE(39.5) },
  ],
  // Desierto: dunas bajo el sol.
  desert: [
    { tone: 'soft', d: 'M16 22a7 7 0 1 1 0-14a7 7 0 1 1 0 14z' },
    { tone: 'mid', d: 'M4 33c8-7 17-9 26-5 5 2.2 9.6 2 14-.6V42H4z' },
    { tone: 'deep', d: 'M4 38c9-5 18-5.6 27-2.2 4.6 1.8 9 1.8 13 .2V42H4z' },
    { tone: 'deep', d: 'M33 30v-8.5a1.8 1.8 0 0 1 3.6 0V30zM30 26.5v-3a1.3 1.3 0 0 1 2.6 0v1.5h1.4v2.4h-2.6a1.4 1.4 0 0 1-1.4-.9zM39.6 25v-2a1.3 1.3 0 0 0-2.6 0v.6h-1.4V26h2.6a1.4 1.4 0 0 0 1.4-1z' },
  ],
  // Campo y viñedos: colinas con hileras y un árbol.
  countryside: [
    { tone: 'soft', d: 'M4 30c7-6 15-7.6 23-4.6 6 2.2 11.6 1.4 17-1.4V42H4z' },
    { tone: 'mid', d: 'M4 34c9-5 19-5.6 28-2.6 4.4 1.4 8.4 1.4 12 0V42H4z' },
    { tone: 'white', d: 'M9 38.6c6-2.6 12.6-3.2 19-1.8l-.4 1.3c-6.1-1.3-12.4-.8-18.1 1.8zM18 41.8c5.6-1.8 11.6-2 17.4-.6l-.3 1.2c-5.5-1.3-11.2-1.2-16.6.6z' },
    { tone: 'deep', d: 'M35 24V17h2v7z' },
    { tone: 'deep', d: 'M36 18.5a5.5 5.5 0 1 1 0-11a5.5 5.5 0 1 1 0 11z' },
    { tone: 'deep', d: 'M12 22.5V18h7v4.5zM11 18.4l4.5-4 4.5 4z' },
  ],
  // Invierno: cabaña con nieve entre pinos.
  winter: [
    { tone: 'deep', d: 'M9 34 14 22l5 12z' }, { tone: 'deep', d: 'M10.4 28 14 18l3.6 10z' }, { tone: 'deep', d: 'M29 34l5.5-13L40 34z' }, { tone: 'deep', d: 'M30.6 27.6l3.9-10.6 3.9 10.6z' },
    { tone: 'mid', d: 'M16 40V29l8-7 8 7v11z' },
    { tone: 'white', d: 'M14 29.6 24 20.8l10 8.8-1.6 1.4L24 23.6 15.6 31z' + r(21.6, 33, 4.8, 7, 0.8) },
    { tone: 'soft', d: 'M3 40c6-2 12-2.6 21-2.6S39 38 45 40v2H3z' },
  ],
  // Puerto: faro sobre las rocas.
  harbor: [
    { tone: 'soft', d: 'M24 8 9 13.5l15 1.5zM24 8l15 5.5L24 15z' },
    { tone: 'deep', d: 'M20 36l1.8-20h4.4L28 36z' },
    { tone: 'white', d: 'M21.2 22.6h5.6l.4 4h-6.4zM20.6 29.6h6.8l.4 4h-7.6z' },
    { tone: 'mid', d: r(20.5, 11, 7, 5, 1.2) },
    { tone: 'deep', d: 'M23 11V8.5a1 1 0 0 1 2 0V11z' },
    { tone: 'deep', d: 'M12 37c3-2.6 6-3.4 9-2.6h12c3-.4 5.4.6 7 2.6z' },
    { tone: 'mid', d: r(5, 36, 38, 6, 1.6) },
    { tone: 'wave', d: WAVE_LINE(39.5) },
  ],
});

/** Tipo de ciudad por defecto para algunas ciudades conocidas; el resto usa `city`. */
const CITY_TYPE_BY_NAME = Object.freeze({
  amsterdam: 'waterfront', brujas: 'waterfront', bruges: 'waterfront', brugge: 'waterfront', venecia: 'waterfront',
  venice: 'waterfront', venezia: 'waterfront', estocolmo: 'waterfront', stockholm: 'waterfront', copenhague: 'waterfront',
  copenhagen: 'waterfront', colonia: 'waterfront', cologne: 'waterfront', koln: 'waterfront', budapest: 'waterfront',
  'ciudad de mexico': 'metropolis', 'mexico city': 'metropolis', cdmx: 'metropolis', 'nueva york': 'metropolis',
  'new york': 'metropolis', tokio: 'metropolis', tokyo: 'metropolis', frankfurt: 'metropolis', londres: 'metropolis',
  london: 'metropolis', berlin: 'metropolis', paris: 'metropolis', madrid: 'metropolis', 'sao paulo': 'metropolis',
  'hong kong': 'metropolis', singapur: 'metropolis', singapore: 'metropolis', dubai: 'metropolis', shanghai: 'metropolis',
  gante: 'oldTown', ghent: 'oldTown', gent: 'oldTown', praga: 'oldTown', prague: 'oldTown', praha: 'oldTown',
  nuremberg: 'oldTown', nurnberg: 'oldTown', bamberg: 'oldTown', rothenburg: 'oldTown', 'rothenburg ob der tauber': 'oldTown',
  toledo: 'oldTown', florencia: 'oldTown', florence: 'oldTown', firenze: 'oldTown', cracovia: 'oldTown', krakow: 'oldTown',
  roma: 'oldTown', rome: 'oldTown', munich: 'oldTown', munchen: 'oldTown', viena: 'oldTown', vienna: 'oldTown', wien: 'oldTown',
  barcelona: 'coast', lisboa: 'coast', lisbon: 'coast', niza: 'coast', nice: 'coast', cancun: 'tropical', tulum: 'tropical',
  'rio de janeiro': 'coast', sydney: 'harbor', marsella: 'harbor', marseille: 'harbor', hamburgo: 'harbor', hamburg: 'harbor',
  interlaken: 'mountain', zermatt: 'mountain', innsbruck: 'mountain', cusco: 'mountain', 'la paz': 'mountain',
  ginebra: 'lake', geneva: 'lake', zurich: 'lake', lucerna: 'lake', lucerne: 'lake', hallstatt: 'lake', como: 'lake',
  marrakech: 'desert', dubrovnik: 'coast', santorini: 'coast', oia: 'coast', bali: 'tropical', honolulu: 'tropical',
  burdeos: 'countryside', bordeaux: 'countryside', mendoza: 'countryside', toscana: 'countryside',
  reikiavik: 'winter', reykjavik: 'winter', rovaniemi: 'winter', tromso: 'winter', quebec: 'winter',
});

function normalizedName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tipo de icono de una ciudad. */
export function cityTypeFor(city) {
  const name = normalizedName(city?.name || String(city?.displayName || '').split(',')[0]);
  return CITY_TYPE_BY_NAME[name] || 'city';
}

export function cityTypeIcon(type) {
  return CITY_TYPE_ICONS[type] || CITY_TYPE_ICONS.city;
}
