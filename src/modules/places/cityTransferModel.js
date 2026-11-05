// Más allá de esta distancia en línea recta el traslado suele ser en avión,
// que Google Routes no calcula.
export const LIKELY_FLIGHT_KM = 900;

/**
 * Salida de referencia para buscar horarios de transporte: 09:00 hora local del
 * día del traslado. La zona se aproxima por longitud (15° por hora), suficiente
 * para pedir horarios de la mañana. Si la fecha ya pasó, Google usa la hora actual.
 */
export function transferDepartureTime(date, lon = 0, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '';
  const offsetHours = Number.isFinite(Number(lon)) ? Math.round(Number(lon) / 15) : 0;
  const departure = Date.parse(`${date}T09:00:00Z`) - offsetHours * 60 * 60 * 1000;
  return Number.isFinite(departure) && departure > now ? new Date(departure).toISOString() : '';
}

/**
 * Cambios de ciudad dentro de un mismo día del calendario (día de traslado).
 */
export function cityTransfers(assignments) {
  const list = Array.isArray(assignments) ? assignments : [];
  const transfers = [];
  for (let index = 1; index < list.length; index += 1) {
    const from = list[index - 1]?.destination;
    const to = list[index]?.destination;
    if (!from || !to || (from.id && from.id === to.id) || from.name === to.name) continue;
    transfers.push({ key: `${list[index - 1].segmentId}>${list[index].segmentId}`, from, to });
  }
  return transfers;
}
