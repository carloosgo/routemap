import {
  IconChevronDown,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';
import './OriginOptions.css';

export function ItineraryOrigin({
  city,
  formattedNights,
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
          />
        </div>
      </div>

      <div className="itinerary-stop__after-place itinerary-origin__after-place">
        <div className="itinerary-stop__metrics itinerary-origin__metrics">
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
          className={'btn btn--icon segment__note-btn itinerary-origin__note-btn' + (hasNote ? ' has-note' : '')}
          aria-label={originNoteLabel}
          title={originNoteLabel}
          onClick={onOpenNote}
        >
          <IconNote size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn--icon segment__toggle segment__details-btn itinerary-origin__details-btn"
          aria-label={t('openSegmentDetails')}
          title={t('openSegmentDetails')}
          onClick={onOpenDetails}
        >
          <IconChevronDown size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn--icon itinerary-origin__clear"
          aria-label={clearOriginLabel}
          title={clearOriginLabel}
          onClick={onClear}
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
