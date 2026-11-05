// Mismo lenguaje de trazo en el riel de la lista y en el mapa.
export const ROUTE_STROKES = Object.freeze({
  walk: { color: '#475569', style: 'dotted' },
  transit: { color: '#23647a', style: 'solid' },
  drive: { color: '#0e4f63', style: 'solid' },
  bicycle: { color: '#2a9d8f', style: 'dashed' },
  none: { color: '#c9ced7', style: 'dashed' },
});

/** Distintivos de las líneas de transporte de una ruta, sin repetir. */
export function transitLineBadges(route) {
  const seen = new Set();
  const badges = [];
  (Array.isArray(route?.segments) ? route.segments : []).forEach((segment) => {
    if (segment?.kind !== 'transit') return;
    const label = String(segment.label || '').trim();
    const key = `${label}|${segment.color || ''}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    badges.push({ label, color: segment.color || ROUTE_STROKES.transit.color });
  });
  return badges.slice(0, 3);
}

export function routeStroke(route) {
  if (!route?.mode) return ROUTE_STROKES.none;
  if (route.mode === 'transit') {
    const first = transitLineBadges(route)[0];
    return { ...ROUTE_STROKES.transit, color: first?.color || ROUTE_STROKES.transit.color };
  }
  return ROUTE_STROKES[route.mode] || ROUTE_STROKES.none;
}

