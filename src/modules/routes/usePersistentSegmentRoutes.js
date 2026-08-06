import { useEffect, useRef } from 'react';
import { requestGeoapifyRoute } from '../places/geoapifyClient.js';
import {
  createDirectSegmentRoute,
  hasReusableSegmentRoute,
  routeModeForSegment,
  segmentRouteSignature,
} from './routeModel.js';

export function usePersistentSegmentRoutes(segments, updateSegment) {
  const requestsRef = useRef(new Map());

  useEffect(() => {
    if (!Array.isArray(segments) || typeof updateSegment !== 'function') return undefined;
    const activeSegmentIds = new Set();

    segments.forEach((segment) => {
      const signature = segmentRouteSignature(segment);
      if (!signature || hasReusableSegmentRoute(segment)) return;

      activeSegmentIds.add(segment.id);
      const current = requestsRef.current.get(segment.id);
      if (current?.signature === signature) return;
      current?.controller.abort();

      const controller = new AbortController();
      requestsRef.current.set(segment.id, { signature, controller });
      const mode = routeModeForSegment(segment);
      const request = mode === 'plane'
        ? Promise.resolve(createDirectSegmentRoute(segment))
        : requestGeoapifyRoute(
            {
              origin: segment.origin,
              destination: segment.destination,
              mode,
            },
            { signal: controller.signal }
          );

      request
        .then((route) => {
          if (!route || controller.signal.aborted) return;
          updateSegment(segment.id, { route });
        })
        .catch((error) => {
          if (error?.name !== 'AbortError') {
            console.warn('[Route persistence] route unavailable', {
              segmentId: segment.id,
              mode,
              error: error?.message || 'Unknown error',
            });
          }
        })
        .finally(() => {
          const latest = requestsRef.current.get(segment.id);
          if (latest?.controller === controller) requestsRef.current.delete(segment.id);
        });
    });

    requestsRef.current.forEach((request, segmentId) => {
      if (activeSegmentIds.has(segmentId)) return;
      request.controller.abort();
      requestsRef.current.delete(segmentId);
    });

    return undefined;
  }, [segments, updateSegment]);

  useEffect(
    () => () => {
      requestsRef.current.forEach(({ controller }) => controller.abort());
      requestsRef.current.clear();
    },
    []
  );
}
