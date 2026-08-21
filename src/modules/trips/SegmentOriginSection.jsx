import { useState } from 'react';
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
  const bodyId = `origin-body-${segment.id}`;

  return (
    <section className="itinerary-origin-section">
      <ItineraryOrigin
        city={segment.origin}
        expanded={expanded}
        bodyId={bodyId}
        onSelect={(origin) => onUpdate({ origin })}
        onToggle={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <OriginBody
          details={originDetails}
          currency={currency}
          locale={locale}
          bodyId={bodyId}
          onUpdate={onUpdateOriginDetails}
          onUpdateExpenses={onUpdateOriginExpenses}
        />
      )}
    </section>
  );
}
