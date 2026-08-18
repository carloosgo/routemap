import { useState } from 'react';
import { segmentTotal } from './tripModel.js';
import { SegmentBody } from './SegmentBody.jsx';
import { SegmentDeleteDialog } from './SegmentDeleteDialog.jsx';
import { SegmentHeader } from './SegmentHeader.jsx';
import {
  formatSegmentAmount,
  formatSegmentDateParts,
  segmentNightCount,
} from './segmentFormModel.js';
import './ItineraryTimeline.css';

function SegmentDropIndicator({ placement }) {
  if (!placement) return null;

  return (
    <span
      aria-hidden="true"
      className={'segment-drop-indicator segment-drop-indicator--' + placement}
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
  onUpdateDestination,
  onUpdateExpenses,
  onRemove,
  onOpenNote,
  onReorderPointerStart,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bodyId = `segment-body-${segment.id}`;
  const formattedAmount = formatSegmentAmount(segmentTotal(segment), locale);
  const formattedDates = formatSegmentDateParts(segment, locale);
  const nights = segmentNightCount(segment);

  const confirmRemove = () => {
    setConfirmOpen(false);
    onRemove();
  };

  return (
    <article
      className={
        'segment segment--timeline' +
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
        formattedAmount={formattedAmount}
        nights={nights}
        expanded={expanded}
        dragging={dragging}
        bodyId={bodyId}
        onToggle={onToggle}
        onUpdateDestination={onUpdateDestination}
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
          originEditable={index === 0}
          onUpdate={onUpdate}
          onUpdateDestination={onUpdateDestination}
          onUpdateExpenses={onUpdateExpenses}
        />
      )}

      <SegmentDeleteDialog
        open={confirmOpen}
        onConfirm={confirmRemove}
        onCancel={() => setConfirmOpen(false)}
      />
    </article>
  );
}
