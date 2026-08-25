import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { segmentTotal } from './tripModel.js';
import { SegmentDeleteDialog } from './SegmentDeleteDialog.jsx';
import { SegmentHeader } from './SegmentHeader.jsx';
import { SegmentOriginSection } from './SegmentOriginSection.jsx';
import { ORIGIN_NOTE_TARGET } from './tripNoteTargets.js';
import { formatSegmentAmount } from './segmentFormModel.js';
import './ItineraryTimeline.css';
import './ItineraryRequestedPolish.css';
import './ItineraryCorrectionPolish.css';
import './ItinerarySegmentDividers.css';

function SegmentDropIndicator({ placement }) {
  if (!placement) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', left: 0, right: 0,
        top: placement === 'before' ? '-3px' : 'auto',
        bottom: placement === 'after' ? '-3px' : 'auto',
        height: '1px', background: 'var(--line-strong)',
        pointerEvents: 'none', zIndex: 30,
      }}
    />
  );
}

function CountryRunRail({ startSegmentRef, startsAtOrigin }) {
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

    const mutationObserver = typeof MutationObserver === 'function'
      ? new MutationObserver(resolveRail)
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

export function SegmentForm({
  segment,
  index,
  sequenceNumber,
  sequenceColor,
  countryRunPosition,
  joinsPreviousCountryRun = false,
  locale,
  currency,
  originDetails,
  dragging,
  dragOffsetY,
  dropPlacement,
  onUpdate,
  onRemove,
  onOpenNote,
  onOpenDetails,
  onReorderPointerStart,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const segmentRef = useRef(null);
  const formattedAmount = formatSegmentAmount(segmentTotal(segment), locale, currency);
  const startsCountryRun = countryRunPosition === 'start'
    || (index === 0 && countryRunPosition === 'middle' && joinsPreviousCountryRun);
  const startsAtOrigin = index === 0
    && countryRunPosition === 'middle'
    && joinsPreviousCountryRun;

  const confirmRemove = () => {
    setConfirmOpen(false);
    onRemove();
  };

  const openSegmentNote = () => onOpenNote(segment.id);
  const openOriginNote = () => onOpenNote(ORIGIN_NOTE_TARGET);
  const openSegmentDetails = () => onOpenDetails(segment.id);
  const openOriginDetails = () => onOpenDetails(ORIGIN_NOTE_TARGET);

  return (
    <>
      {index === 0 && (
        <SegmentOriginSection
          segment={segment}
          locale={locale}
          currency={currency}
          originDetails={originDetails}
          onUpdate={onUpdate}
          onOpenNote={openOriginNote}
          onOpenDetails={openOriginDetails}
        />
      )}
      <article
        ref={segmentRef}
        className={
          'segment itinerary-segment' +
          (joinsPreviousCountryRun ? ' is-country-run-joined' : '') +
          (countryRunPosition === 'middle' ? ' is-country-run-middle' : '') +
          (index === 0 && joinsPreviousCountryRun ? ' is-country-run-joined-from-origin' : '') +
          (dragging ? ' is-dragging' : '') +
          (dropPlacement ? ` is-drop-${dropPlacement}` : '')
        }
        data-segment-id={segment.id}
        style={dragging ? {
          transform: `translateY(${dragOffsetY}px)`, pointerEvents: 'none', zIndex: 20,
        } : undefined}
      >
        <SegmentDropIndicator placement={dropPlacement} />
        <SegmentHeader
          segment={segment}
          locale={locale}
          formattedAmount={formattedAmount}
          sequenceNumber={sequenceNumber}
          sequenceColor={sequenceColor}
          countryRunPosition={countryRunPosition}
          dragging={dragging}
          onDestinationSelect={(destination) => onUpdate({ destination })}
          onOpenNote={openSegmentNote}
          onOpenDetails={openSegmentDetails}
          onRemoveRequest={() => setConfirmOpen(true)}
          onReorderPointerStart={onReorderPointerStart}
        />
        <SegmentDeleteDialog
          open={confirmOpen}
          onConfirm={confirmRemove}
          onCancel={() => setConfirmOpen(false)}
        />
      </article>
      {startsCountryRun && (
        <CountryRunRail
          startSegmentRef={segmentRef}
          startsAtOrigin={startsAtOrigin}
        />
      )}
    </>
  );
}
