import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function CountryRunRail({ startSegmentRef, startsAtOrigin }) {
  const [railState, setRailState] = useState(null);

  useLayoutEffect(() => {
    const startSegment = startSegmentRef.current;
    const container = startSegment?.parentElement;
    if (!startSegment || !container?.classList.contains('segments')) return undefined;

    const resolveRail = () => {
      let endSegment = startSegment;
      let sibling = endSegment.nextElementSibling;

      while (sibling) {
        if (sibling.classList.contains('itinerary-country-run-rail')) {
          sibling = sibling.nextElementSibling;
          continue;
        }
        if (
          !sibling.classList.contains('itinerary-segment')
          || !sibling.classList.contains('is-country-run-joined')
        ) {
          break;
        }
        endSegment = sibling;
        sibling = sibling.nextElementSibling;
      }

      const startMarker = startsAtOrigin
        ? container.querySelector(':scope > .itinerary-origin-section .itinerary-origin__marker')
        : startSegment.querySelector('.itinerary-stop__marker');
      const endMarker = endSegment.querySelector('.itinerary-stop__marker');
      if (!startMarker || !endMarker) return;

      const containerBounds = container.getBoundingClientRect();
      const startBounds = startMarker.getBoundingClientRect();
      const endBounds = endMarker.getBoundingClientRect();
      const top = startBounds.top + (startBounds.height / 2) - containerBounds.top;
      const end = endBounds.top + (endBounds.height / 2) - containerBounds.top;
      const height = Math.max(0, end - top);
      if (height <= 0) return;

      setRailState((current) => {
        if (
          current?.container === container
          && Math.abs(current.top - top) < 0.25
          && Math.abs(current.height - height) < 0.25
        ) {
          return current;
        }
        return { container, top, height };
      });
    };

    resolveRail();

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(resolveRail)
      : null;
    resizeObserver?.observe(container);

    const mutationObserver = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(resolveRail)
      : null;
    mutationObserver?.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('resize', resolveRail);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', resolveRail);
    };
  }, [startSegmentRef, startsAtOrigin]);

  if (!railState) return null;

  return createPortal(
    <span
      className="itinerary-country-run-rail"
      aria-hidden="true"
      style={{
        '--country-run-top': `${railState.top}px`,
        '--country-run-height': `${railState.height}px`,
      }}
    />,
    railState.container
  );
}
