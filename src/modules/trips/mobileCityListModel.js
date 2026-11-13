// Cálculos del reordenamiento por arrastre de la lista de ciudades en móvil.

/** Desplazamiento de las demás tarjetas mientras una se arrastra. */
export function shiftForIndex(index, fromIndex, targetIndex, slot) {
  if (fromIndex == null || targetIndex == null || index === fromIndex) return 0;
  if (fromIndex < targetIndex && index > fromIndex && index <= targetIndex) return -slot;
  if (targetIndex < fromIndex && index >= targetIndex && index < fromIndex) return slot;
  return 0;
}

export function targetIndexFor(fromIndex, offsetY, slot, count) {
  if (!slot) return fromIndex;
  const next = fromIndex + Math.round(offsetY / slot);
  return Math.max(0, Math.min(count - 1, next));
}
