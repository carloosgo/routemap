import {
  IconChevronDown,
  IconChevronUp,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';
import './OriginOptions.css';

export function ItineraryOrigin({
  city,
  formattedDate,
  formattedNights,
  formattedAmount,
  hasNote,
  expanded,
  bodyId,
  onSelect,
  onOpenNote,
  onToggle,
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
        {city?.country && (
          <span className="itinerary-origin__country">{city.country}</span>
        )}
      </div>

      <div className="itinerary-stop__metrics itinerary-origin__metrics">
        <span className={'itinerary-stop__dates' + (!formattedDate ? ' is-placeholder' : '')}>
          <span className="itinerary-stop__date-line">
            {formattedDate || '—'}
          </span>
        </span>
        <span
          className={
            'segment__pill itinerary-stop__nights' +
            (!formattedNights ? ' is-placeholder' : '')
          }
        >
          {formattedNights || t('nightsHint')}
        </span>
        <span className="segment__pill itinerary-stop__amount">{formattedAmount}</span>
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
        className="btn btn--icon segment__toggle itinerary-origin__toggle"
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={expanded ? t('collapse') : t('expand')}
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
        className="btn btn--icon itinerary-origin__clear"
        aria-label={clearOriginLabel}
        title={clearOriginLabel}
        onClick={onClear}
      >
        <IconX size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
