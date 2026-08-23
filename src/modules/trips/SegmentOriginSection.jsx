import { expensesTotal } from '../expenses/expenseModel.js';
import {
  formatSegmentAmount,
  formatSegmentDate,
} from './segmentFormModel.js';
import { ItineraryOrigin } from './ItineraryOrigin.jsx';

export function SegmentOriginSection({
  segment,
  locale,
  currency,
  originDetails,
  onUpdate,
  onOpenNote,
  onOpenDetails,
}) {
  const formattedStartDate = formatSegmentDate(originDetails?.departureDate, locale) || '—';
  const formattedEndDate = '—';
  const formattedAmount = formatSegmentAmount(
    expensesTotal(originDetails?.expenses),
    locale,
    currency
  );

  return (
    <section className="itinerary-origin-section">
      <ItineraryOrigin
        city={segment.origin}
        formattedStartDate={formattedStartDate}
        formattedEndDate={formattedEndDate}
        formattedAmount={formattedAmount}
        hasNote={Boolean(originDetails?.note)}
        onSelect={(origin) => onUpdate({ origin })}
        onOpenNote={onOpenNote}
        onOpenDetails={onOpenDetails}
        onClear={() => onUpdate({ origin: null })}
      />
    </section>
  );
}
