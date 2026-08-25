import { useState } from 'react';
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
  const formattedAmount = formatSegmentAmount(segmentTotal(segment), locale, currency);

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
    </>
  );
}
