import { IconChevronDown } from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';

export function ItineraryOrigin({ city, expanded, bodyId, onSelect, onToggle }) {
  const { t } = useTranslation();

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
      <button
        type="button"
        className={'itinerary-origin__toggle' + (expanded ? ' is-expanded' : '')}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={expanded ? t('collapse') : t('expand')}
        onClick={onToggle}
      >
        <IconChevronDown size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
