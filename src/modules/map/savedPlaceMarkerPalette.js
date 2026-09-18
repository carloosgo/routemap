const SAVED_PLACE_ICON_PREFIX = 'atlas-saved-place-pin';

export const SAVED_PLACE_MARKER_COLORS = Object.freeze([
  '#e23b3b',
  '#2563eb',
  '#7c3aed',
  '#ea580c',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ca8a04',
  '#0f766e',
  '#9333ea',
  '#c2410c',
  '#0369a1',
  '#be123c',
  '#4d7c0f',
  '#a16207',
  '#4338ca',
  '#0e7490',
  '#b91c1c',
  '#6d28d9',
  '#15803d',
]);

function normalizedPaletteIndex(index) {
  const numericIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return (
    (numericIndex % SAVED_PLACE_MARKER_COLORS.length)
    + SAVED_PLACE_MARKER_COLORS.length
  ) % SAVED_PLACE_MARKER_COLORS.length;
}

export function savedPlaceMarkerStyle(index) {
  const paletteIndex = normalizedPaletteIndex(index);
  return {
    color: SAVED_PLACE_MARKER_COLORS[paletteIndex],
    iconId: `${SAVED_PLACE_ICON_PREFIX}-${paletteIndex}`,
  };
}

export function savedPlaceMarkerStyles() {
  return SAVED_PLACE_MARKER_COLORS.map((color, index) => ({
    color,
    iconId: `${SAVED_PLACE_ICON_PREFIX}-${index}`,
  }));
}

export const DEFAULT_SAVED_PLACE_ICON_ID = savedPlaceMarkerStyle(0).iconId;
