import {
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import { useTranslation } from '../../i18n/index.jsx';
import './SegmentHeader.css';

export function SegmentHeader({
  segment,
  formattedDates,
  formattedNights,
  formattedAmount,
  expanded,
  dragging,
  bodyId,
  onToggle,
  onOpenNote,
  onRemoveRequest,
  onReorderPointerStart,
}) {
  const { t } = useTranslation();
  const destination = segment.destination;
  const cityName = destination?.name || destination?.displayName || t('destination');
  const country = destination?.country || '';

  return (
    <header className="segment__header itinerary-stop">
      <span
        className="segment__drag-handle itinerary-stop__drag"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onReorderPointerStart}
        aria-hidden="true"
      >
        <IconGripVertical size={14} stroke={1.8} />
      </span>

      <span className={'itinerary-stop__marker' + (!destination?.countryCode ? ' is-empty' : '')}>
        {destination?.countryCode ? (
          <img
            src={flagImageUrl(destination.countryCode, 24)}
            alt=""
            width={24}
            height={17}
            loading="lazy"
          />
        ) : null}
      </span>

      <button
        type="button"
        className="itinerary-stop__summary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <span className="itinerary-stop__heading">
          <span className="itinerary-stop__city">{cityName}</span>
          {country && <span className="itinerary-stop__country">{country}</span>}
        </span>
        {(formattedDates || formattedNights) && (
          <span className="itinerary-stop__meta">
            {formattedDates}
            {formattedDates && formattedNights && <span aria-hidden="true"> · </span>}
            {formattedNights}
          </span>
        )}
      </button>

      <span className="segment__pill itinerary-stop__amount">{formattedAmount}</span>

      <button
        type="button"
        className={'btn btn--icon segment__note-btn' + (segment.note ? ' has-note' : '')}
        aria-label={t('segmentNote')}
        title={t('segmentNote')}
        onClick={onOpenNote}
      >
        <IconNote size={14} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="btn btn--icon segment__toggle"
        aria-label={expanded ? t('collapse') : t('expand')}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        {expanded ? (
          <IconChevronUp size={14} aria-hidden="true" />
        ) : (
          <IconChevronDown size={14} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className="btn btn--icon"
        aria-label={t('removeSegment')}
        onClick={onRemoveRequest}
      >
        <IconX size={14} aria-hidden="true" />
      </button>
    </header>
  );
}
