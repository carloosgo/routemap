import { expensesTotal } from '../expenses/expenseModel.js';
import { formatSegmentAmount, formatSegmentDate } from './segmentFormModel.js';
import { ItineraryOrigin } from './ItineraryOrigin.jsx';

export function SegmentOriginSection({
  origin,
  locale,
  currency,
  originDetails,
  onUpdateOrigin,
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
        city={origin}
        formattedDepartureDate={formattedDepartureDate}
        formattedAmount={formattedAmount}
        hasNote={Boolean(originDetails?.note)}
        onSelect={onUpdateOrigin}
        onOpenNote={onOpenNote}
        onOpenDetails={onOpenDetails}
        onClear={() => onUpdateOrigin(null)}
      />
    </section>
  );
}
