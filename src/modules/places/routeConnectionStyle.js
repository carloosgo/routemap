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
    const icon = String(segment.icon || '');
    const key = `${label}|${segment.color || ''}|${icon}`;
    if ((!label && !icon) || seen.has(key)) return;
    seen.add(key);
    badges.push({
      label,
      color: segment.color || ROUTE_STROKES.transit.color,
      textColor: segment.textColor || '#ffffff',
      icon,
    });
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


const VEHICLE_KEYS = Object.freeze({
  BUS: 'transitVehicleBus',
  INTERCITY_BUS: 'transitVehicleBus',
  TROLLEYBUS: 'transitVehicleBus',
  SHARE_TAXI: 'transitVehicleBus',
  SUBWAY: 'transitVehicleSubway',
  METRO_RAIL: 'transitVehicleSubway',
  TRAM: 'transitVehicleTram',
  RAIL: 'transitVehicleTrain',
  HEAVY_RAIL: 'transitVehicleTrain',
  COMMUTER_TRAIN: 'transitVehicleTrain',
  HIGH_SPEED_TRAIN: 'transitVehicleTrain',
  LONG_DISTANCE_TRAIN: 'transitVehicleTrain',
  MONORAIL: 'transitVehicleTrain',
  FERRY: 'transitVehicleFerry',
  CABLE_CAR: 'transitVehicleCable',
  GONDOLA_LIFT: 'transitVehicleCable',
  FUNICULAR: 'transitVehicleCable',
});

/** Clave de traducción del tipo de vehículo de Google (Bus, Tren, Metro…). */
export function transitVehicleKey(vehicleType) {
  return VEHICLE_KEYS[String(vehicleType || '').toUpperCase()] || '';
}

function stationKey(name) {
  return String(name || '').trim().toLowerCase();
}

function secondsBetween(from, to) {
  const start = Date.parse(from || '');
  const end = Date.parse(to || '');
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 1000) : 0;
}

/**
 * Itinerario de transporte como una secuencia legible: estación, tramo,
 * transbordo, estación… Si el transbordo es en la misma estación no se repite.
 */
export function transitItinerary(steps, maxSteps = 8) {
  const list = (Array.isArray(steps) ? steps : []).slice(0, maxSteps);
  const items = [];
  list.forEach((step, index) => {
    const previous = list[index - 1];
    if (!previous) {
      items.push({ type: 'stop', name: step.departureStop, time: step.departureTime, timeZone: step.departureTimeZone });
    } else {
      const sameStation = stationKey(previous.arrivalStop) === stationKey(step.departureStop);
      items.push({
        type: 'transfer',
        walk: !sameStation,
        seconds: secondsBetween(previous.arrivalTime, step.departureTime),
      });
      if (!sameStation) {
        items.push({ type: 'stop', name: step.departureStop, time: step.departureTime, timeZone: step.departureTimeZone });
      }
    }
    items.push({ type: 'ride', step, seconds: secondsBetween(step.departureTime, step.arrivalTime) });
    items.push({ type: 'stop', name: step.arrivalStop, time: step.arrivalTime, timeZone: step.arrivalTimeZone });
  });
  return items;
}
