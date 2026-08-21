import { useEffect, useRef, useState } from 'react';
import { segmentTotal } from './tripModel.js';
import { SegmentBody } from './SegmentBody.jsx';
import { SegmentDeleteDialog } from './SegmentDeleteDialog.jsx';
import { SegmentHeader } from './SegmentHeader.jsx';
import { SegmentOriginSection } from './SegmentOriginSection.jsx';
import { ORIGIN_NOTE_TARGET } from './tripNoteTargets.js';
import { formatSegmentAmount, formatSegmentDates, formatSegmentNights } from './segmentFormModel.js';
import './ItineraryTimeline.css';
import './ItineraryRequestedPolish.css';
import './ItineraryCorrectionPolish.css';

const EXPANDED_REVEAL_DELAY_MS = 210;

function SegmentDropIndicator({ placement }) {
  if (!placement) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: placement === 'before' ? '-3px' : 'auto',
        bottom: placement === 'after' ? '-3px' : 'auto',
        height: '1px',
        background: 'var(--line-strong)',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    />
  );
}

export function SegmentForm({
  segment,
  index,
  currency,
  locale,
  originDetails,
  expanded,
  dragging,
  dragOffsetY,
  dropPlacement,
  onToggle,
  onUpdate,
  onUpdateExpenses,
  onUpdateOriginDetails,
  onUpdateOriginExpenses,
  onRemove,
  onOpenNote,
  onReorderPointerStart,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const segmentRef = useRef(null);
  const bodyId = `segment-body-${segment.id}`;
  const formattedAmount = formatSegmentAmount(segmentTotal(segment), locale);
  const formattedDates = formatSegmentDates(segment, locale);
  const formattedNights = formatSegmentNights(segment, locale);

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

  const confirmRemove = () => {
    setConfirmOpen(false);
    onRemove();
  };

  const openSegmentNote = () => onOpenNote(segment.id);
  const openOriginNote = () => onOpenNote(ORIGIN_NOTE_TARGET);
  return (
    <>
      {index === 0 && (
        <SegmentOriginSection
          segment={segment}
          currency={currency}
          locale={locale}
          originDetails={originDetails}
          onUpdate={onUpdate}
          onUpdateOriginDetails={onUpdateOriginDetails}
          onUpdateOriginExpenses={onUpdateOriginExpenses}
          onOpenNote={openOriginNote}
        />
      )}
      <article
        ref={segmentRef}
        className={
          'segment itinerary-segment' +
          (dragging ? ' is-dragging' : '') +
          (dropPlacement ? ` is-drop-${dropPlacement}` : '')
        }
        data-segment-id={segment.id}
        style={
          dragging
            ? {
                transform: `translateY(${dragOffsetY}px)`,
                pointerEvents: 'none',
                zIndex: 20,
              }
            : undefined
        }
      >
        <SegmentDropIndicator placement={dropPlacement} />
        <SegmentHeader
          segment={segment}
          formattedDates={formattedDates}
          formattedNights={formattedNights}
          formattedAmount={formattedAmount}
          expanded={expanded}
          dragging={dragging}
          bodyId={bodyId}
          onToggle={onToggle}
          onDestinationSelect={(destination) => onUpdate({ destination })}
          onOpenNote={openSegmentNote}
          onRemoveRequest={() => setConfirmOpen(true)}
          onReorderPointerStart={onReorderPointerStart}
        />
        {expanded && (
          <SegmentBody
            segment={segment}
            currency={currency}
            locale={locale}
            bodyId={bodyId}
            onUpdate={onUpdate}
            onUpdateExpenses={onUpdateExpenses}
          />
        )}
        <SegmentDeleteDialog
          open={confirmOpen}
          onConfirm={confirmRemove}
          onCancel={() => setConfirmOpen(false)}
        />
      </article>
    </>
  );
}
