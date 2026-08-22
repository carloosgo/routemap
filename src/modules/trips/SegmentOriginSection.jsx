import { useEffect, useState } from 'react';
import { expensesTotal } from '../expenses/expenseModel.js';
import {
  formatSegmentAmount,
  formatSegmentDate,
  formatSegmentNights,
} from './segmentFormModel.js';
import { ItineraryOrigin } from './ItineraryOrigin.jsx';
import { OriginBody } from './OriginBody.jsx';

const COLLAPSE_DURATION_MS = 190;

export function CollapsibleRegion({ open, children }) {
  const [mounted, setMounted] = useState(open);
  const [visuallyOpen, setVisuallyOpen] = useState(open);

  useEffect(() => {
    let animationFrame;
    let timeoutId;

    if (open) {
      setMounted(true);
      const scheduleFrame = globalThis.requestAnimationFrame
        || ((callback) => globalThis.setTimeout(callback, 0));
      animationFrame = scheduleFrame(() => setVisuallyOpen(true));
    } else {
      setVisuallyOpen(false);
      timeoutId = globalThis.setTimeout(() => setMounted(false), COLLAPSE_DURATION_MS);
    }

    return () => {
      if (animationFrame !== undefined) {
        if (globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(animationFrame);
        else globalThis.clearTimeout(animationFrame);
      }
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={`itinerary-collapse${visuallyOpen ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      <div className="itinerary-collapse__inner">{children}</div>
    </div>
  );
}

export function SegmentOriginSection({
  segment,
  currency,
  locale,
  originDetails,
  onUpdate,
  onUpdateOriginDetails,
  onUpdateOriginExpenses,
  onOpenNote,
}) {
  const [expanded, setExpanded] = useState(false);
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
        onOpenNote={onOpenNote}
        onToggle={() => setExpanded((value) => !value)}
        onClear={() => onUpdate({ origin: null })}
      />
      <CollapsibleRegion open={expanded}>
        <OriginBody
          details={originDetails}
          currency={currency}
          locale={locale}
          bodyId={bodyId}
          onUpdate={onUpdateOriginDetails}
          onUpdateExpenses={onUpdateOriginExpenses}
        />
      </CollapsibleRegion>
    </section>
  );
}
