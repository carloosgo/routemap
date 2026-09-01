import {
  IconChevronDown,
  IconNote,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';
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
}) {
  const { t } = useTranslation();
  const originNoteLabel = `${t('segmentNote')}: ${t('origin')}`;

  return (
    <div className="itinerary-origin" aria-label={t('origin')}>
      <span
        className={'itinerary-origin__marker' + (!city?.countryCode ? ' is-empty' : '')}
        aria-hidden="true"
      >
        {city?.countryCode ? (
          <img
            src={flagImageUrl(city.countryCode, 80)}
            alt=""
            width={30}
            height={20}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </span>

      <div className="itinerary-origin__place">
        <div className="itinerary-origin__picker">
          <CityAutocomplete
            value={city}
            onSelect={onSelect}
            placeholder={t('originPlaceholder')}
            selectedDisplay="timeline"
            focusNextOnSelect
          />
        </div>
      </div>

      <div className="itinerary-stop__after-place itinerary-origin__after-place">
        <div className="itinerary-stop__metrics itinerary-origin__metrics">
          <span
            className="itinerary-stop__date-range"
            title={formattedDepartureDate || undefined}
          >
            <span>{formattedDepartureDate || ''}</span>
            <span aria-hidden="true" />
          </span>
          <span className="itinerary-stop__amount">{formattedAmount}</span>
        </div>

        <button
          type="button"
          className="btn btn--icon segment__note-btn itinerary-origin__note-btn"
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
          className="btn btn--icon segment__toggle segment__details-btn itinerary-origin__details-btn"
          aria-label={t('openSegmentDetails')}
          title={t('openSegmentDetails')}
          onClick={onOpenDetails}
        >
          <IconChevronDown className="itinerary-details-chevron" size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
