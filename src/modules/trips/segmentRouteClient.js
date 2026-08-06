import { geoapifyCallable } from '../places/geoapifyCallable.js';
import {
  isRoutableSegment,
  normalizeSegmentRoute,
  routeModeForSegment,
} from './segmentRouteModel.js';

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export async function requestGeoapifyRoute(segment, { signal } = {}) {
  if (!isRoutableSegment(segment)) return null;

  throwIfAborted(signal);
  const request = geoapifyCallable('geoapifyRoute');
  const response = await request({
    origin: {
      lat: Number(segment.origin.lat),
      lon: Number(segment.origin.lon),
    },
    destination: {
      lat: Number(segment.destination.lat),
      lon: Number(segment.destination.lon),
    },
    mode: routeModeForSegment(segment),
  });
  throwIfAborted(signal);

  const route = normalizeSegmentRoute(response.data, segment);
  if (!route) throw new Error('Geoapify devolvió una ruta inválida.');
  return route;
}
