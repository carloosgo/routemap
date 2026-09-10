// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('arrastrar un día sigue al puntero y reutiliza la elevación visual del itinerario', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(panel, /sourceOffset,\s*pointerId: event\.pointerId,\s*startY: event\.clientY,\s*offsetY: 0,/s);
  assert.match(panel, /offsetY: event\.clientY - current\.startY,\s*targetOffset:/s);
  assert.match(panel, /transform: `translateY\(\$\{dayDrag\.offsetY\}px\)`,\s*pointerEvents: 'none',\s*zIndex: 20,/s);
  assert.match(panel, /\.trip-day-first__day\.is-day-dragging\{[^}]*background:rgba\(255,255,255,\.96\)[^}]*border-radius:8px[^}]*box-shadow:0 8px 22px rgba\(15,23,42,\.11\)/);
});

test('Mis Rutas dibuja un único rail recto entre el primer y último punto', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(
    panel,
    /\.trip-day-first__rail\{[^}]*top:24px;bottom:28px;left:var\(--trip-timeline-x\);width:2px;transform:translateX\(-50%\);background:var\(--trip-day-rail-color,#64748b\)/,
    'el rail debe ser un solo eje de 2px colocado en el mismo x que los puntos'
  );
  assert.match(panel, /day\.places\.length > 1 && \([\s\S]*?<span className="trip-day-first__rail" aria-hidden="true" \/>/);
  assert.match(panel, /\.trip-day-first-place:before,\.trip-day-first-place:after\{content:none\}/);
  assert.match(panel, /\.trip-day-first-connection \.trip-connection__rail\{display:none\}/);
});

test('el título del lugar permanece principal y ciudad país usan gris oscuro', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(panel, /\{placeTitle\(place, t\)\}[\s\S]*?trip-day-first-place__location/);
  assert.match(panel, /\.trip-day-first-place__location\{color:#475569;font-weight:500\}/);
});
