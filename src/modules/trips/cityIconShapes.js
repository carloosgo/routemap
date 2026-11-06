/**
 * Piezas de dibujo compartidas por los iconos propios de Atlas (lienzo 48 × 48).
 * Cada icono es una lista de formas `{ tone, d }` (o `{ tone, d, stroke }` para
 * líneas) en los tonos `mid`, `deep`, `soft` y `white` del color de la parada.
 */

const n = (value) => Number(value.toFixed(2));

/** Rectángulo con esquinas redondeadas. */
export function r(x, y, w, h, rx = 0) {
  const k = Math.min(rx, w / 2, h / 2);
  if (!k) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
  return `M${n(x + k)} ${n(y)}h${n(w - 2 * k)}a${n(k)} ${n(k)} 0 0 1 ${n(k)} ${n(k)}v${n(h - 2 * k)}`
    + `a${n(k)} ${n(k)} 0 0 1 ${n(-k)} ${n(k)}h${n(-(w - 2 * k))}a${n(k)} ${n(k)} 0 0 1 ${n(-k)} ${n(-k)}`
    + `v${n(-(h - 2 * k))}a${n(k)} ${n(k)} 0 0 1 ${n(k)} ${n(-k)}z`;
}

/** Círculo. */
export function circle(cx, cy, radius) {
  return `M${n(cx - radius)} ${n(cy)}a${n(radius)} ${n(radius)} 0 1 0 ${n(2 * radius)} 0`
    + `a${n(radius)} ${n(radius)} 0 1 0 ${n(-2 * radius)} 0z`;
}

/** Vano con remate de medio punto (puertas y ventanas), apoyado en `bottom`. */
export function arch(x, bottom, w, h) {
  const k = w / 2;
  return `M${n(x)} ${n(bottom)}v${n(-(h - k))}a${n(k)} ${n(k)} 0 0 1 ${n(w)} 0v${n(h - k)}z`;
}

/** Bloque almenado: `count` merlones sobre un muro de `top` a `bottom`. */
export function crenel(x, top, w, bottom, count, depth = 2) {
  const m = w / (2 * count - 1);
  let d = `M${n(x)} ${n(bottom)}V${n(top)}`;
  for (let index = 0; index < count; index += 1) {
    d += `h${n(m)}`;
    if (index < count - 1) d += `v${n(depth)}h${n(m)}v${n(-depth)}`;
  }
  return `${d}V${n(bottom)}z`;
}

/** Ventanas pequeñas iguales en las posiciones dadas. */
export function windows(positions, w = 2.4, h = 3) {
  return positions.map(([x, y]) => r(x, y, w, h, Math.min(0.6, w / 2))).join('');
}

/** Barra fina entre dos puntos (radios, tirantes). */
export function bar(x1, y1, x2, y2, width) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ox = (-(y2 - y1) / length) * (width / 2);
  const oy = ((x2 - x1) / length) * (width / 2);
  return `M${n(x1 + ox)} ${n(y1 + oy)}L${n(x2 + ox)} ${n(y2 + oy)}L${n(x2 - ox)} ${n(y2 - oy)}L${n(x1 - ox)} ${n(y1 - oy)}z`;
}

/** Ola suave que cabe dentro del agua (x de 9 a 39); se dibuja como línea blanca. */
export const WAVE_LINE = (y) => `M9 ${y}${'c1.9 0 1.9-1.5 3.75-1.5s1.9 1.5 3.75 1.5'.repeat(4)}`;

/** Suelo común a los iconos. */
export const GROUND = Object.freeze({ tone: 'deep', d: r(5, 39.5, 38, 2.5, 1.25) });
