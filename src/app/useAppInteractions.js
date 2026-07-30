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

function matchingScopeElements(element) {
  if (!element) return [];

  const scopeClass = Array.from(element.classList || []).find(Boolean);
  if (!scopeClass) return [element];

  return Array.from(document.getElementsByClassName(scopeClass));
}

export function useOutsideClick(ref, active, onOutside) {
  useEffect(() => {
    if (!active) return undefined;

    function onPointerDown(event) {
      const scopes = matchingScopeElements(ref.current);
      const isInsideAnyScope = scopes.some((scope) => !isOutsideTarget(scope, event.target));

      if (!isInsideAnyScope) {
        onOutside();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [active, onOutside, ref]);
}

export function useOutsideClickSelector(selector, active, onOutside) {
  useEffect(() => {
    if (!active) return undefined;

    function onDocumentClick(event) {
      const noteButton = event.target?.closest?.('.segment__note-btn');

      if (selector === '.segnote' && noteButton) {
        const clickedSegmentId = noteButton.closest?.('[data-segment-id]')?.dataset?.segmentId;
        const openSegmentId = document.querySelector('.segnote')?.dataset?.segmentId;

        if (clickedSegmentId === openSegmentId) {
          onOutside();
        }
        return;
      }

      if (!event.target?.closest?.(selector)) {
        onOutside();
      }
    }

    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [active, onOutside, selector]);
}

export function useCollapseSegmentsOnTripChange(tripId, segments, setExpandedSegments) {
  const previousTripIdRef = useRef(tripId);

  useEffect(() => {
    if (previousTripIdRef.current === tripId) return;

    previousTripIdRef.current = tripId;
    setExpandedSegments(createCollapsedSegments(segments));
  }, [segments, setExpandedSegments, tripId]);
}
