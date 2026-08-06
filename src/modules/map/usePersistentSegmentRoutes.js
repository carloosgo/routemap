import { useEffect, useRef, useState } from 'react';
import { requestGeoapifyRoute } from '../trips/segmentRouteClient.js';
import {
  isRoutableSegment,
  normalizeSegmentRoute,
  routeSignatureForSegment,
} from '../trips/segmentRouteModel.js';

const ROUTE_REQUEST_SPACING_MS = 3200;

export function usePersistentSegmentRoutes({
  segments,
  enabled,
  updateSegment,
}) {
  const inFlightRef = useRef(null);
  const failedSignaturesRef = useRef(new Set());
  const resolvedRoutesRef = useRef(new Map());
  const mountedRef = useRef(true);
  const timerRef = useRef(null);
  const [queueVersion, setQueueVersion] = useState(0);

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!enabled || typeof updateSegment !== 'function' || inFlightRef.current) {
      return;
    }

    const currentSignatures = new Set();
    for (const segment of segments || []) {
      const signature = routeSignatureForSegment(segment);
      if (!signature) continue;
      currentSignatures.add(signature);
      const storedRoute = normalizeSegmentRoute(segment.route, segment);
      if (storedRoute) resolvedRoutesRef.current.set(signature, storedRoute);
    }

    failedSignaturesRef.current = new Set(
      [...failedSignaturesRef.current].filter((signature) =>
        currentSignatures.has(signature)
      )
    );
    resolvedRoutesRef.current = new Map(
      [...resolvedRoutesRef.current].filter(([signature]) =>
        currentSignatures.has(signature)
      )
    );

    const candidate = (segments || []).find((segment) => {
      if (!isRoutableSegment(segment)) return false;
      const signature = routeSignatureForSegment(segment);
      return Boolean(
        signature
          && !normalizeSegmentRoute(segment.route, segment)
          && !failedSignaturesRef.current.has(signature)
      );
    });
    if (!candidate) return;

    const signature = routeSignatureForSegment(candidate);
    const resolved = resolvedRoutesRef.current.get(signature);
    if (resolved) {
      updateSegment(candidate.id, { route: resolved });
      return;
    }

    inFlightRef.current = { segmentId: candidate.id, signature };
    requestGeoapifyRoute(candidate)
      .then((route) => {
        if (!route) return;
        resolvedRoutesRef.current.set(signature, route);
        if (mountedRef.current) {
          updateSegment(candidate.id, { route });
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          failedSignaturesRef.current.add(signature);
        }
      })
      .finally(() => {
        inFlightRef.current = null;
        if (!mountedRef.current) return;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setQueueVersion((version) => version + 1);
        }, ROUTE_REQUEST_SPACING_MS);
      });
  }, [enabled, queueVersion, segments, updateSegment]);
}
