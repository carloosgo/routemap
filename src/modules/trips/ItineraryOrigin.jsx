import {
  IconChevronDown,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ItineraryCityVisual } from './ItineraryCityVisual.jsx';
import './OriginOptions.css';

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

export function ItineraryOrigin({
  city,
  formattedDepartureDate,
  formattedAmount,
  hasNote,
  onSelect,
  onOpenNote,
  onOpenDetails,
  onClear,
}) {
  const { t } = useTranslation();
  const originNoteLabel = `${t('segmentNote')}: ${t('origin')}`;
  const clearOriginLabel = `${t('delete')} ${t('origin')}`;
  const departureDate = formattedDepartureDate || '—';

  return (
    <div
      className="itinerary-origin itinerary-origin--card itinerary-card__content"
      aria-label={t('origin')}
    >
      <div className="itinerary-origin__visual-frame itinerary-card__visual-frame">
        <ItineraryCityVisual city={city} accent="#6d7b86" />
        <span className="itinerary-origin__badge">{t('origin')}</span>
      </div>

      <div className="itinerary-card__place">
        <CityAutocomplete
          value={city}
          onSelect={onSelect}
          placeholder={t('originPlaceholder')}
          selectedDisplay="full"
          focusNextOnSelect
        />
      </div>

      <div className="itinerary-card__footer">
        <div className="itinerary-card__metrics">
          <span className="itinerary-card__date" title={departureDate}>
            {departureDate}
          </span>
          <span className="itinerary-card__amount">{formattedAmount}</span>
        </div>

        <div className="itinerary-card__actions">
          <button
            type="button"
            className="btn btn--icon segment__note-btn itinerary-origin__note-btn itinerary-card__action"
            style={hasNote ? { color: '#417c8f' } : undefined}
            aria-label={originNoteLabel}
            title={originNoteLabel}
            onClick={onOpenNote}
          >
            <IconNote size={14} aria-hidden="true" />
            {hasNote && <span aria-hidden="true" style={NOTE_DOT_STYLE} />}
          </button>

          <button
            type="button"
            className="btn btn--icon segment__toggle segment__details-btn itinerary-origin__details-btn itinerary-card__action"
            aria-label={t('openSegmentDetails')}
            title={t('openSegmentDetails')}
            onClick={onOpenDetails}
          >
            <IconChevronDown className="itinerary-details-chevron" size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="btn btn--icon itinerary-stop__remove-btn itinerary-origin__clear itinerary-card__action"
            aria-label={clearOriginLabel}
            title={clearOriginLabel}
            onClick={onClear}
          >
            <IconX size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
