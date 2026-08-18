import {
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';
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
  onDestinationSelect,
  onOpenNote,
  onRemoveRequest,
  onReorderPointerStart,
}) {
  const { t } = useTranslation();
  const destination = segment.destination;

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

      <div className="itinerary-stop__place">
        <div className="itinerary-stop__picker">
          <CityAutocomplete
            value={destination}
            onSelect={onDestinationSelect}
            placeholder={t('destination')}
          />
        </div>
        {destination?.country && (
          <span className="itinerary-stop__country">{destination.country}</span>
        )}
      </div>

      <span className="itinerary-stop__dates">{formattedDates || '—'}</span>
      <span className="itinerary-stop__nights">{formattedNights || ''}</span>
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
