import { expensesTotal } from '../expenses/expenseModel.js';
import {
  formatSegmentAmount,
  formatSegmentDate,
  formatSegmentNights,
} from './segmentFormModel.js';
import { ItineraryOrigin } from './ItineraryOrigin.jsx';

export function SegmentOriginSection({
  segment,
  locale,
  originDetails,
  onUpdate,
  onOpenNote,
  onOpenDetails,
}) {
  const formattedDate = formatSegmentDate(originDetails?.departureDate, locale);
  const formattedNights = formatSegmentNights({
    startDate: originDetails?.departureDate,
    endDate: segment?.startDate,
  }, locale);
  const formattedAmount = formatSegmentAmount(
    expensesTotal(originDetails?.expenses),
    locale
  );

  return (
    <section className="itinerary-origin-section">
      <ItineraryOrigin
        city={segment.origin}
        formattedDate={formattedDate}
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
