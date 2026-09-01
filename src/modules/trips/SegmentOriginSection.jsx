import { expensesTotal } from '../expenses/expenseModel.js';
import { formatSegmentAmount, formatSegmentDate } from './segmentFormModel.js';
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
  const formattedAmount = formatSegmentAmount(
    expensesTotal(originDetails?.expenses),
    locale,
    currency
  );
  const formattedDepartureDate = formatSegmentDate(
    originDetails?.departureDate,
    locale
  );

  return (
    <section className="itinerary-origin-section">
      <ItineraryOrigin
        city={segment.origin}
        formattedDepartureDate={formattedDepartureDate}
        formattedAmount={formattedAmount}
        hasNote={Boolean(originDetails?.note)}
        onSelect={(origin) => onUpdate({ origin })}
        onOpenNote={onOpenNote}
        onOpenDetails={onOpenDetails}
      />
    </section>
  );
}
