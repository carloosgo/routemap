import {
  IconChevronDown,
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
  formattedNights,
  formattedAmount,
  dragging,
  onDestinationSelect,
  onOpenNote,
  onOpenDetails,
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
            src={flagImageUrl(destination.countryCode, 80)}
            alt=""
            width={30}
            height={20}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </span>

      <div className="itinerary-stop__place">
        <div className="itinerary-stop__picker">
          <CityAutocomplete
            value={destination}
            onSelect={onDestinationSelect}
            placeholder={t('destination')}
            selectedDisplay="timeline"
          />
        </div>
      </div>

      <div className="itinerary-stop__after-place">
        <div className="itinerary-stop__metrics">
          <span
            className={
              'itinerary-stop__nights' + (!formattedNights ? ' is-placeholder' : '')
            }
          >
            {formattedNights || t('nightsHint')}
          </span>
          <span className="itinerary-stop__amount">{formattedAmount}</span>
        </div>

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
          className="btn btn--icon segment__toggle segment__details-btn itinerary-stop__details-btn"
          aria-label={t('openSegmentDetails')}
          title={t('openSegmentDetails')}
          onClick={onOpenDetails}
        >
          <IconChevronDown size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('removeSegment')}
          onClick={onRemoveRequest}
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
