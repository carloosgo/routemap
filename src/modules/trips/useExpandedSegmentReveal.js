import { useEffect, useRef } from 'react';

const EXPANDED_REVEAL_DELAY_MS = 210;

export function useExpandedSegmentReveal(expanded, dragging) {
  const segmentRef = useRef(null);

  useEffect(() => {
    if (!expanded || dragging) return undefined;
    const timeoutId = globalThis.setTimeout(() => {
      segmentRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }, EXPANDED_REVEAL_DELAY_MS);
    return () => globalThis.clearTimeout(timeoutId);
  }, [expanded, dragging]);

  return segmentRef;
}
