import { expensesTotal } from '../expenses/expenseModel.js';
import {
  formatSegmentAmount,
  formatSegmentNights,
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
  const formattedNights = formatSegmentNights({
    startDate: originDetails?.departureDate,
    endDate: segment?.startDate,
  }, locale);
  const formattedAmount = formatSegmentAmount(
    expensesTotal(originDetails?.expenses),
    locale,
    currency
  );

  return (
    <section className="itinerary-origin-section">
      <ItineraryOrigin
        city={segment.origin}
        formattedNights={formattedNights}
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
