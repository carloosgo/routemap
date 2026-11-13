import {
  IconNote,
  IconReceipt,
  IconTrash,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ItineraryCityVisual } from './ItineraryCityVisual.jsx';
import { formatSegmentCardDateRange } from './segmentFormModel.js';
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

const SEQUENCE_BADGE_STYLE = Object.freeze({
  position: 'absolute',
  zIndex: 12,
  top: '6px',
  left: '6px',
  width: '20px',
  minWidth: '20px',
  height: '20px',
  minHeight: '20px',
  display: 'grid',
  placeItems: 'center',
  margin: 0,
  transform: 'none',
  border: 0,
  borderRadius: '50%',
  background: '#ffffff',
  fontSize: '10.5px',
  fontWeight: 800,
  lineHeight: 1,
  boxShadow: '0 1px 3px rgba(23, 38, 45, 0.18)',
});

export function SegmentHeader({
  segment,
  locale,
  formattedAmount,
  sequenceNumber,
  sequenceColor,
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
  const formattedDateRange = formatSegmentCardDateRange(segment, locale);
  // Número de parada en blanco sobre el bloque de color de la ciudad.
  const sequenceBadgeStyle = {
    ...SEQUENCE_BADGE_STYLE,
    color: sequenceColor || '#1f718c',
    pointerEvents: 'auto',
    cursor: dragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    userSelect: 'none',
  };

  return (
    <header className="segment__header itinerary-stop itinerary-card__content">
      <div className="itinerary-stop__visual-frame itinerary-card__visual-frame">
        <ItineraryCityVisual city={destination} accent={sequenceColor} />

        {/* El número es el asa para mover la ciudad (ya no hay puntitos sobre la imagen). */}
        {sequenceNumber != null && (
          <span
            className="itinerary-stop__sequence-badge"
            style={sequenceBadgeStyle}
            data-sequence-drag="true"
            onPointerDown={onReorderPointerStart}
            title={t('moveCity')}
          >
            {sequenceNumber}
          </span>
        )}
      </div>

      <div className="itinerary-card__identity">
        <div
          className="itinerary-card__place"
          title={destinationLocked ? t('segmentHasPlannedPlaces') : undefined}
        >
          <CityAutocomplete
            value={destination}
            onSelect={onDestinationSelect}
            placeholder={t('destination')}
            selectedDisplay="timeline"
            focusNextOnSelect
            disabled={destinationLocked}
          />
        </div>

        <span
          className="itinerary-card__date itinerary-stop__date-range"
          title={formattedDateRange || undefined}
        >
          {formattedDateRange || ''}
        </span>
      </div>

      <div className="itinerary-card__side">
        <span className="itinerary-card__amount itinerary-stop__amount">
          {formattedAmount}
        </span>

        <div className="itinerary-card__actions">
          <button
            type="button"
            className="btn btn--icon segment__note-btn itinerary-card__action"
            style={hasNote ? { color: '#417c8f' } : undefined}
            aria-label={t('segmentNote')}
            title={t('segmentNote')}
            onClick={onOpenNote}
          >
            <IconNote size={15} stroke={1.8} aria-hidden="true" />
            {hasNote && <span aria-hidden="true" style={NOTE_DOT_STYLE} />}
          </button>

          <button
            type="button"
            className="btn btn--icon segment__toggle segment__details-btn itinerary-stop__details-btn itinerary-card__action"
            aria-label={t('openSegmentDetails')}
            title={t('openSegmentDetails')}
            onClick={onOpenDetails}
          >
            <IconReceipt size={15} stroke={1.8} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="btn btn--icon itinerary-stop__remove-btn"
            aria-label={t('removeSegment')}
            title={destinationLocked ? t('segmentHasPlannedPlaces') : t('removeSegment')}
            onClick={onRemoveRequest}
          >
            <IconTrash size={15} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
