// Lenguaje de trazos de Mis rutas en el mapa. La forma dice cómo te mueves:
// a pie = puntos, transporte = color de su línea con borde blanco y estaciones,
// auto = continuo marina, bici = rayas, sin elegir = recta tenue.

export const MY_ROUTE_COLORS = Object.freeze({
  walk: '#475569',
  transit: '#23647a',
  drive: '#0e4f63',
  bicycle: '#2a9d8f',
  pending: '#0b1f2c',
  casing: '#ffffff',
});

function dots(maps, color, scale = 2.2, repeat = '9px') {
  return [{
    icon: {
      path: maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeOpacity: 0,
      scale,
    },
    offset: '0',
    repeat,
  }];
}

function dashes(maps, color, scale = 3, repeat = '14px', opacity = 1) {
  return [{
    icon: { path: 'M 0,-1 0,1', strokeColor: color, strokeOpacity: opacity, strokeWeight: scale, scale },
    offset: '0',
    repeat,
  }];
}

function stations(maps, color) {
  const station = {
    path: maps.SymbolPath.CIRCLE,
    fillColor: '#ffffff',
    fillOpacity: 1,
    strokeColor: color,
    strokeWeight: 2.5,
    scale: 4.5,
  };
  return [{ icon: station, offset: '0%' }, { icon: station, offset: '100%' }];
}

/**
 * Capas de polilínea (de abajo hacia arriba) para un tramo. `kind` es walk,
 * transit, drive, bicycle u other; `color` solo se usa en transporte.
 */
export function routeLineLayers(maps, { kind, color = '' }, path) {
  const base = { path, clickable: false, geodesic: false };
  if (kind === 'walk') {
    return [
      { ...base, strokeColor: MY_ROUTE_COLORS.casing, strokeOpacity: 0.9, strokeWeight: 7, zIndex: 1 },
      { ...base, strokeOpacity: 0, icons: dots(maps, MY_ROUTE_COLORS.walk), zIndex: 2 },
    ];
  }
  if (kind === 'transit') {
    const lineColor = color || MY_ROUTE_COLORS.transit;
    return [
      { ...base, strokeColor: MY_ROUTE_COLORS.casing, strokeOpacity: 1, strokeWeight: 10, zIndex: 3 },
      { ...base, strokeColor: lineColor, strokeOpacity: 1, strokeWeight: 5.5, zIndex: 4, icons: stations(maps, lineColor) },
    ];
  }
  if (kind === 'bicycle') {
    return [
      { ...base, strokeColor: MY_ROUTE_COLORS.casing, strokeOpacity: 0.9, strokeWeight: 8, zIndex: 1 },
      { ...base, strokeOpacity: 0, icons: dashes(maps, MY_ROUTE_COLORS.bicycle, 3.5, '15px'), zIndex: 2 },
    ];
  }
  const solid = kind === 'drive' ? MY_ROUTE_COLORS.drive : MY_ROUTE_COLORS.walk;
  return [
    { ...base, strokeColor: MY_ROUTE_COLORS.casing, strokeOpacity: 0.95, strokeWeight: 9, zIndex: 1 },
    { ...base, strokeColor: solid, strokeOpacity: 1, strokeWeight: 5, zIndex: 2 },
  ];
}

/** Recta tenue entre dos paradas consecutivas sin modo elegido. */
/**
 * Arco suave entre dos puntos (curva cuadrática), para unir lugares que aún no
 * tienen ruta sin que parezca un trayecto real. Se calcula en un plano local
 * corregido por la latitud, suficiente para distancias dentro de una ciudad.
 */
export function arcPath(from, to, bend = 0.2, samples = 32) {
  if (!from || !to) return [];
  const scaleX = Math.cos(((from.lat + to.lat) / 2) * Math.PI / 180) || 1;
  const ax = from.lng * scaleX;
  const bx = to.lng * scaleX;
  const dx = bx - ax;
  const dy = to.lat - from.lat;
  if (!dx && !dy) return [from, to];
  // Punto de control desplazado en perpendicular al centro del segmento.
  const cx = (ax + bx) / 2 - dy * bend;
  const cy = (from.lat + to.lat) / 2 + dx * bend;
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    const step = index / samples;
    const inverse = 1 - step;
    const x = inverse * inverse * ax + 2 * inverse * step * cx + step * step * bx;
    const y = inverse * inverse * from.lat + 2 * inverse * step * cy + step * step * to.lat;
    points.push({ lat: y, lng: x / scaleX });
  }
  return points;
}

export function pendingLineLayer(maps, path) {
  const arc = path?.length === 2 ? arcPath(path[0], path[1]) : path;
  return {
    path: arc,
    clickable: false,
    geodesic: false,
    strokeOpacity: 0,
    zIndex: 0,
    icons: dashes(maps, MY_ROUTE_COLORS.pending, 2, '8px', 0.85),
  };
}

/**
 * Tramos a dibujar para una ruta: los de transporte si los hay; si no, la ruta
 * completa con el estilo de su modo.
 */
export function routeDrawSegments(route, geometryPaths) {
  if (Array.isArray(route?.segments) && route.segments.length > 0) {
    return route.segments.map((segment) => ({
      kind: segment.kind === 'other' ? route.mode : segment.kind,
      color: segment.color || '',
      label: segment.kind === 'transit' ? segment.label || '' : '',
      textColor: segment.kind === 'transit' ? segment.textColor || '' : '',
      icon: segment.kind === 'transit' ? segment.icon || '' : '',
      stops: segment.kind === 'transit' && Array.isArray(segment.stops) ? segment.stops : [],
      stopCount: segment.kind === 'transit' ? Number(segment.stopCount) || 0 : 0,
      vehicle: segment.kind === 'transit' ? segment.vehicle || '' : '',
      coordinates: segment.geometry?.coordinates || [],
    }));
  }
  return geometryPaths(route?.geometry).map((coordinates) => ({
    kind: route?.mode || 'drive',
    color: '',
    label: '',
    textColor: '',
    icon: '',
    stops: [],
    coordinates,
  }));
}

/**
 * Punto de estación sobre la línea de transporte (DOM): blanco con borde del
 * color de la línea; subida y bajada un poco más grandes.
 */
export function transitStopElement(color, { name = '', end = false } = {}) {
  const dot = document.createElement('span');
  dot.dataset.transitStop = end ? 'end' : 'mid';
  if (name) dot.title = name;
  const size = end ? 12 : 9;
  Object.assign(dot.style, {
    display: 'block',
    width: `${size}px`,
    height: `${size}px`,
    boxSizing: 'border-box',
    borderRadius: '50%',
    background: '#ffffff',
    border: `${end ? 3 : 2.5}px solid ${color || '#23647a'}`,
    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.9)',
    transform: 'translateY(50%)',
    pointerEvents: 'none',
  });
  return dot;
}

export function middlePoint(path) {
  if (!Array.isArray(path) || !path.length) return null;
  return path[Math.floor((path.length - 1) / 2)];
}

/** Marcador numerado del día (DOM). `muted` = lugar de otro día. */
export function numberedPlaceMarker({ number, color, selected = false, muted = false, label = '', name = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.dataset.myRoutesMarker = muted ? 'muted' : 'day';
  const size = muted ? 12 : selected ? 36 : 28;
  Object.assign(button.style, {
    display: 'flex',
    width: `${size}px`,
    height: `${size}px`,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    border: '0',
    borderRadius: '50%',
    background: muted ? '#b7bec8' : color,
    color: '#ffffff',
    font: `700 ${selected ? 15 : 13}px var(--font-body, sans-serif)`,
    cursor: 'pointer',
    transform: 'translateY(50%)',
    boxShadow: muted
      ? '0 0 0 2px #ffffff'
      : selected
        ? `0 0 0 3px #ffffff, 0 0 0 7px ${color}40, 0 4px 10px rgba(15, 23, 42, 0.3)`
        : '0 0 0 2.5px #ffffff, 0 3px 8px rgba(15, 23, 42, 0.3)',
  });
  if (!muted && number) button.textContent = String(number);
  const text = String(name || '').trim();
  if (muted || !text) return button;

  // Cápsula negra con el nombre bajo el número. Va en posición absoluta para
  // no mover el ancla del marcador; `declutterPlaceLabels` oculta las que se
  // empalman con otra cápsula o con otro número.
  const wrap = document.createElement('div');
  wrap.dataset.myRoutesPlace = 'day';
  Object.assign(wrap.style, { position: 'relative', display: 'flex', justifyContent: 'center' });
  const caption = document.createElement('span');
  caption.dataset.myRoutesLabel = 'true';
  caption.textContent = text;
  Object.assign(caption.style, {
    position: 'absolute',
    top: `calc(100% + ${size / 2 + 5}px)`,
    left: '50%',
    display: 'block',
    boxSizing: 'border-box',
    maxWidth: '150px',
    height: '20px',
    padding: '0 8px',
    overflow: 'hidden',
    borderRadius: '999px',
    background: '#1f2328',
    color: '#ffffff',
    font: '400 11px/20px var(--font-body, sans-serif)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.25)',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  });
  wrap.append(button, caption);
  return wrap;
}

function rectsOverlap(a, b, gap = 2) {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}

/**
 * Muestra las cápsulas de nombre en orden de prioridad y oculta las que se
 * empalman con una ya visible o con cualquier número del mapa.
 * `contents` son los contenidos de los marcadores, de mayor a menor prioridad.
 */
export function declutterPlaceLabels(contents) {
  const circles = contents
    .map((content) => (content.matches?.('button') ? content : content.querySelector?.('button')))
    .filter(Boolean)
    .map((button) => button.getBoundingClientRect())
    .filter((rect) => rect.width > 0);
  const placed = [];
  contents.forEach((content) => {
    const caption = content.querySelector?.('[data-my-routes-label]');
    if (!caption) return;
    caption.style.visibility = 'visible';
    const rect = caption.getBoundingClientRect();
    const own = content.querySelector('button')?.getBoundingClientRect();
    const blocked = rect.width === 0
      || placed.some((other) => rectsOverlap(rect, other))
      || circles.some((circle) => circle !== own
        && !(own && circle.left === own.left && circle.top === own.top)
        && rectsOverlap(rect, circle, 0));
    if (blocked) {
      caption.style.visibility = 'hidden';
      return;
    }
    placed.push(rect);
  });
}

/** Distintivo de línea sobre el trazo (DOM). */
export function transitBadgeElement(label, color, { textColor = '', icon = '' } = {}) {
  const badge = document.createElement('span');
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '22px',
    padding: icon ? '0 7px 0 3px' : '0 7px',
    borderRadius: '6px',
    background: color || MY_ROUTE_COLORS.transit,
    color: textColor || '#ffffff',
    font: '700 11px var(--font-body, sans-serif)',
    boxShadow: '0 0 0 2px #ffffff, 0 2px 6px rgba(15, 23, 42, 0.2)',
    transform: 'translateY(50%)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  if (icon) {
    // El logo va sobre blanco para que se lea sobre cualquier color de línea.
    const logo = document.createElement('img');
    logo.src = icon;
    logo.alt = '';
    logo.referrerPolicy = 'no-referrer';
    Object.assign(logo.style, { width: '16px', height: '16px', objectFit: 'contain', borderRadius: '4px', background: '#ffffff' });
    logo.addEventListener('error', () => logo.remove());
    badge.append(logo);
  }
  if (label) badge.append(document.createTextNode(label));
  return badge;
}
