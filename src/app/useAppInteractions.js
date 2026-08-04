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

function suppressNextClick(element) {
  if (!element) return;

  element.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true, once: true }
  );
}

export function useOutsideClickSelector(selector, active, onOutside) {
  useEffect(() => {
    if (!active) return undefined;

    function onPointerDown(event) {
      const target = event.target;
      if (!target?.closest) return;

      if (selector === '.segnote') {
        const noteButton = target.closest('.segment__note-btn');

        if (noteButton) {
          const clickedSegmentId = noteButton.closest('[data-segment-id]')?.dataset?.segmentId;
          const openSegmentId = document.querySelector('.segnote[data-segment-id]')?.dataset
            ?.segmentId;

          if (clickedSegmentId && clickedSegmentId === openSegmentId) {
            onOutside();
            suppressNextClick(noteButton);
          }

          return;
        }
      }

      if (!target.closest(selector)) {
        onOutside();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [active, onOutside, selector]);
}

export function useCollapseSegmentsOnTripChange(tripId, segments, setExpandedSegments) {
  const previousTripIdRef = useRef(tripId);

  useEffect(() => {
    if (previousTripIdRef.current === tripId) return;

    previousTripIdRef.current = tripId;
    setExpandedSegments(createCollapsedSegments(segments));
  }, [segments, setExpandedSegments, tripId]);

  useEffect(() => {
    const workspace = document.querySelector('.workspace__desktop--floating');
    const editor = workspace?.querySelector('.floating-editor');
    if (!workspace || !editor) return undefined;

    function syncSearchSafeLeft() {
      const workspaceRect = workspace.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const safeLeft = Math.max(0, editorRect.right - workspaceRect.left + 14);
      workspace.style.setProperty('--geo-search-safe-left', `${safeLeft}px`);
    }

    syncSearchSafeLeft();

    const observer = new ResizeObserver(syncSearchSafeLeft);
    observer.observe(workspace);
    observer.observe(editor);
    window.addEventListener('resize', syncSearchSafeLeft);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncSearchSafeLeft);
      workspace.style.removeProperty('--geo-search-safe-left');
    };
  }, []);
}
