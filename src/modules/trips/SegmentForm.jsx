import { useState } from 'react';
import { segmentTotal } from './tripModel.js';
import { ItineraryOrigin } from './ItineraryOrigin.jsx';
import { SegmentBody } from './SegmentBody.jsx';
import { SegmentDeleteDialog } from './SegmentDeleteDialog.jsx';
import { SegmentHeader } from './SegmentHeader.jsx';
import {
  formatSegmentAmount,
  formatSegmentDates,
  formatSegmentNights,
} from './segmentFormModel.js';
import './ItineraryTimeline.css';

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
  expanded,
  dragging,
  dragOffsetY,
  dropPlacement,
  onToggle,
  onUpdate,
  onUpdateExpenses,
  onRemove,
  onOpenNote,
  onReorderPointerStart,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bodyId = `segment-body-${segment.id}`;
  const formattedAmount = formatSegmentAmount(segmentTotal(segment), locale);
  const formattedDates = formatSegmentDates(segment, locale);
  const formattedNights = formatSegmentNights(segment, locale);

  const confirmRemove = () => {
    setConfirmOpen(false);
    onRemove();
  };

  return (
    <>
      {index === 0 && <ItineraryOrigin city={segment.origin} />}

      <article
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
          onOpenNote={onOpenNote}
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
