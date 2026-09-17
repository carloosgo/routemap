import {
  IconChevronDown,
  IconGripVertical,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';
import { formatSegmentDate } from './segmentFormModel.js';
import './SegmentHeader.css';
import './ItinerarySequenceLeft.css';

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

const SELECTED_FLAG_STYLE = Object.freeze({
  width: '27px',
  height: '18px',
});

function CityCardIllustration({ sequenceNumber, sequenceColor }) {
  const variant = Math.abs(Number(sequenceNumber) || 0) % 4;
  const style = sequenceColor ? { '--city-visual-accent': sequenceColor } : undefined;

  return (
    <span
      className="itinerary-stop__visual"
      data-variant={variant}
      style={style}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none" focusable="false">
        {variant === 0 && (
          <>
            <path d="M10 35h28M13 31h22M15 31V20l9-7 9 7v11" />
            <path d="M19 31V22M24 31V22M29 31V22M12 20h24" />
          </>
        )}
        {variant === 1 && (
          <>
            <path d="M9 35h30M12 35V18h15v17M16 22h3M22 22h2M16 27h3M22 27h2M16 32h3M22 32h2" />
            <path d="M33 35v-9M29 28l4-7 4 7-4 3-4-3Z" />
          </>
        )}
        {variant === 2 && (
          <>
            <path d="M8 34h32M11 34V24M37 34V24M11 25c4-9 22-9 26 0" />
            <path d="M16 34v-5M24 34v-7M32 34v-5M8 39c4-3 7 3 11 0s7 3 11 0 7 3 10 0" />
          </>
        )}
        {variant === 3 && (
          <>
            <path d="M13 35h22M17 35l2-16h10l2 16M20 19l4-9 4 9" />
            <path d="M21 24h6M20 29h8M24 10V7M11 35h26" />
          </>
        )}
      </svg>
    </span>
  );
}

export function SegmentHeader({
  segment,
  locale,
  formattedAmount,
  sequenceNumber,
  sequenceColor,
  countryRunPosition,
  dragging,
  destinationLocked = false,
  onDestinationSelect,
  onOpenNote,
  onOpenDetails,
  onRemoveRequest,
  onReorderPointerStart,
}) {
  const { t } = useTranslation();
  const destination = segment.destination;
  const hasNote = Boolean(segment.note);
  const showCountryRunDot = countryRunPosition === 'middle';
  const formattedStartDate = formatSegmentDate(segment.startDate, locale);
  const formattedEndDate = formatSegmentDate(segment.endDate, locale);
  const formattedDatesTitle = formattedStartDate || formattedEndDate
    ? `${formattedStartDate || '—'} – ${formattedEndDate || '—'}`
    : undefined;
  const markerClassName = [
    'itinerary-stop__marker',
    !destination?.countryCode ? 'is-empty' : '',
    countryRunPosition ? `is-country-run-marker is-country-run-${countryRunPosition}` : '',
  ].filter(Boolean).join(' ');

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

      <span className="itinerary-stop__sequence" aria-hidden="true">
        {sequenceNumber != null && (
          <span
            className="itinerary-stop__sequence-badge"
            style={sequenceColor ? { background: sequenceColor } : undefined}
          >
            {sequenceNumber}
          </span>
        )}
      </span>

      <CityCardIllustration
        sequenceNumber={sequenceNumber}
        sequenceColor={sequenceColor}
      />

      <span className={markerClassName}>
        {showCountryRunDot ? (
          <span className="itinerary-stop__country-run-dot" aria-hidden="true" />
        ) : destination?.countryCode ? (
          <img
            className="itinerary-stop__marker-flag"
            src={flagImageUrl(destination.countryCode, 80)}
            alt=""
            width={27}
            height={18}
            style={SELECTED_FLAG_STYLE}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </span>

      <div
        className="itinerary-stop__place"
        title={destinationLocked ? t('segmentHasPlannedPlaces') : undefined}
      >
        <div className="itinerary-stop__picker">
          <CityAutocomplete
            value={destination}
            onSelect={onDestinationSelect}
            placeholder={t('destination')}
            selectedDisplay="timeline"
            focusNextOnSelect
            disabled={destinationLocked}
          />
        </div>
      </div>

      <div className="itinerary-stop__after-place">
        <div className="itinerary-stop__metrics">
          <span className="itinerary-stop__date-range" title={formattedDatesTitle}>
            <span>{formattedStartDate || ''}</span>
            <span>{formattedEndDate || ''}</span>
          </span>
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
          <IconChevronDown className="itinerary-details-chevron" size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn--icon itinerary-stop__remove-btn"
          aria-label={t('removeSegment')}
          title={destinationLocked ? t('segmentHasPlannedPlaces') : t('removeSegment')}
          onClick={onRemoveRequest}
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
