import { useEffect, useRef } from 'react';

export function useSaveShortcut(onSave) {
  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);
}

export function useOutsideClick(ref, active, onOutside) {
  useEffect(() => {
    if (!active) return undefined;

    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        onOutside();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [active, onOutside, ref]);
}

export function useCollapseSegmentsOnTripChange(tripId, segments, setExpandedSegments) {
  const previousTripIdRef = useRef(tripId);

  useEffect(() => {
    if (previousTripIdRef.current === tripId) return;

    previousTripIdRef.current = tripId;
    const collapsed = {};
    (segments || []).forEach((segment) => {
      collapsed[segment.id] = false;
    });
    setExpandedSegments(collapsed);
  }, [segments, setExpandedSegments, tripId]);
}
