// Alturas de la hoja deslizable móvil (Itinerario / Mis Rutas sobre su mapa).
// low: solo el asa y la cabecera de la lista; mid: mitad del escenario;
// high: casi toda la lista, dejando una franja de mapa visible arriba.
export const SHEET_SNAPS = ['low', 'mid', 'high'];
const SHEET_LOW_PX = 112;
const SHEET_MAP_PEEK_PX = 120;
const SHEET_DRAG_THRESHOLD_PX = 24;

export function sheetSnapHeights(stageHeight) {
  const height = Math.max(0, Number(stageHeight) || 0);
  const high = Math.max(SHEET_LOW_PX, height - SHEET_MAP_PEEK_PX);
  const mid = Math.min(high, Math.max(SHEET_LOW_PX, Math.round(height * 0.5)));
  return { low: Math.min(SHEET_LOW_PX, high), mid, high };
}

export function nextSheetSnap(current, startHeight, endHeight, heights, { tapToggles = true } = {}) {
  const delta = endHeight - startHeight;
  const index = SHEET_SNAPS.indexOf(current);
  if (Math.abs(delta) < SHEET_DRAG_THRESHOLD_PX) {
    if (!tapToggles) return current;
    // Un toque en el asa alterna entre media altura y arriba.
    return current === 'high' ? 'mid' : current === 'low' ? 'mid' : 'high';
  }
  const nearest = SHEET_SNAPS.reduce((best, snap) => (
    Math.abs(heights[snap] - endHeight) < Math.abs(heights[best] - endHeight) ? snap : best
  ), current);
  if (nearest !== current) return nearest;
  const step = delta > 0 ? 1 : -1;
  return SHEET_SNAPS[Math.min(SHEET_SNAPS.length - 1, Math.max(0, index + step))];
}
