// Lenguaje de trazos de Mis rutas en el mapa. La forma dice cómo te mueves:
// a pie = puntos, transporte = color de su línea con borde blanco y estaciones,
// auto = continuo marina, bici = rayas, sin elegir = recta tenue.

export const MY_ROUTE_COLORS = Object.freeze({
  walk: '#475569',
  transit: '#23647a',
  drive: '#0e4f63',
  bicycle: '#2a9d8f',
  pending: '#9aa3af',
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
export function pendingLineLayer(maps, path) {
  return {
    path,
    clickable: false,
    geodesic: true,
    strokeOpacity: 0,
    zIndex: 0,
    icons: dashes(maps, MY_ROUTE_COLORS.pending, 2, '12px', 0.9),
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
      coordinates: segment.geometry?.coordinates || [],
    }));
  }
  return geometryPaths(route?.geometry).map((coordinates) => ({
    kind: route?.mode || 'drive',
    color: '',
    label: '',
    coordinates,
  }));
}

export function middlePoint(path) {
  if (!Array.isArray(path) || !path.length) return null;
  return path[Math.floor((path.length - 1) / 2)];
}

/** Marcador numerado del día (DOM). `muted` = lugar de otro día. */
export function numberedPlaceMarker({ number, color, selected = false, muted = false, label = '' }) {
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
  return button;
}

/** Distintivo de línea sobre el trazo (DOM). */
export function transitBadgeElement(label, color) {
  const badge = document.createElement('span');
  badge.textContent = label;
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    height: '20px',
    padding: '0 7px',
    borderRadius: '6px',
    background: color || MY_ROUTE_COLORS.transit,
    color: '#ffffff',
    font: '700 11px var(--font-body, sans-serif)',
    boxShadow: '0 0 0 2px #ffffff, 0 2px 6px rgba(15, 23, 42, 0.2)',
    transform: 'translateY(50%)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  return badge;
}
