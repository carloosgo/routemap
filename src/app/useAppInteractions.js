import { useEffect, useRef } from 'react';
import {
  createCollapsedSegments,
  isOutsideTarget,
  isSaveShortcut,
} from './appInteractionModel.js';

export function useSaveShortcut(onSave) {
  useEffect(() => {
    function onKey(event) {
      if (isSaveShortcut(event)) {
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
      if (isOutsideTarget(ref.current, event.target)) {
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
    setExpandedSegments(createCollapsedSegments(segments));
  }, [segments, setExpandedSegments, tripId]);
}
