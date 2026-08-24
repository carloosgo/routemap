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

const NOTE_DOT_STYLE = Object.freeze({
  position: 'absolute',
  top: '3px',
  left: '-1px',
  width: '5px',
  height: '5px',
  boxSizing: 'border-box',
  borderRadius: '50%',
  border: '1px solid var(--surface, #fff)',
  background: '#417c8f',
  pointerEvents: 'none',
});

export function SegmentHeader({
  segment,
  formattedAmount,
  sequenceNumber,
  sequenceColor,
  dragging,
  onDestinationSelect,
  onOpenNote,
  onOpenDetails,
  onRemoveRequest,
  onReorderPointerStart,
}) {
  const { t } = useTranslation();
  const destination = segment.destination;
  const hasNote = Boolean(segment.note);

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
            className="itinerary-stop__marker-flag"
            src={flagImageUrl(destination.countryCode, 80)}
            alt=""
            width={30}
            height={20}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        {sequenceNumber != null && (
          <span
            className="itinerary-stop__sequence-badge"
            style={sequenceColor ? { background: sequenceColor } : undefined}
          >
            {sequenceNumber}
          </span>
        )}
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
          <span className="itinerary-stop__amount">{formattedAmount}</span>
        </div>

        <button
          type="button"
          className="btn btn--icon segment__note-btn"
          style={hasNote ? { color: '#417c8f' } : undefined}
          aria-label={t('segmentNote')}
          title={t('segmentNote')}
          onClick={onOpenNote}
        >
          <IconNote size={14} aria-hidden="true" />
          {hasNote && <span aria-hidden="true" style={NOTE_DOT_STYLE} />}
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
