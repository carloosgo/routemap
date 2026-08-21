import { useState } from 'react';
import { expensesTotal } from '../expenses/expenseModel.js';
import {
  formatSegmentAmount,
  formatSegmentDate,
  formatSegmentNights,
} from './segmentFormModel.js';
import { ItineraryOrigin } from './ItineraryOrigin.jsx';
import { OriginBody } from './OriginBody.jsx';

export function SegmentOriginSection({
  segment,
  currency,
  locale,
  originDetails,
  onUpdate,
  onUpdateOriginDetails,
  onUpdateOriginExpenses,
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const bodyId = `origin-body-${segment.id}`;
  const formattedDate = formatSegmentDate(originDetails?.departureDate, locale);
  const formattedNights = formatSegmentNights({
    startDate: originDetails?.departureDate,
    endDate: segment?.startDate,
  }, locale);
  const formattedAmount = formatSegmentAmount(
    expensesTotal(originDetails?.expenses),
    locale
  );

  const openNote = () => {
    setExpanded(true);
    setNoteOpen(true);
  };

  return (
    <section className="itinerary-origin-section">
      <ItineraryOrigin
        city={segment.origin}
        formattedDate={formattedDate}
        formattedNights={formattedNights}
        formattedAmount={formattedAmount}
        hasNote={Boolean(originDetails?.note)}
        expanded={expanded}
        bodyId={bodyId}
        onSelect={(origin) => onUpdate({ origin })}
        onOpenNote={openNote}
        onToggle={() => setExpanded((value) => !value)}
        onClear={() => onUpdate({ origin: null })}
      />
      {expanded && (
        <OriginBody
          details={originDetails}
          currency={currency}
          locale={locale}
          bodyId={bodyId}
          showNote={noteOpen}
          onCloseNote={() => setNoteOpen(false)}
          onUpdate={onUpdateOriginDetails}
          onUpdateExpenses={onUpdateOriginExpenses}
        />
      )}
    </section>
  );
}
