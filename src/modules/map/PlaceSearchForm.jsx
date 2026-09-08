import { flagImageUrl } from '../flags/flags.js';
import { useTranslation } from '../../i18n/index.jsx';

export function PlaceSearchForm({
  query,
  suggestions,
  showSuggestions,
  searching,
  suggesting,
  error,
  canClearSearch,
  minChars,
  onSubmit,
  onQueryChange,
  onFocus,
  onClear,
  onChooseSuggestion,
}) {
  const { t } = useTranslation();

  return (
    <form className="geo-search" onSubmit={onSubmit}>
      <div className="geo-search__row">
        <div className="geo-search__input-wrap">
          <input
            value={query}
            onChange={onQueryChange}
            onFocus={onFocus}
            placeholder={t('searchPlacesPlaceholder')}
            aria-label={t('searchPlaces')}
            autoComplete="off"
          />
          {canClearSearch && (
            <button
              type="button"
              className="geo-search__clear"
              aria-label={t('closePlaceSearch')}
              onClick={onClear}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className="geo-search__suggestions" role="listbox" aria-label={t('searchSuggestions')}>
              {suggestions.map((place) => {
                const citySuggestion = place.kind === 'city';
                const secondaryText = citySuggestion
                  ? [place.region, place.country].filter(Boolean).join(', ')
                  : place.secondaryText || [place.city, place.country].filter(Boolean).join(', ');
                return (
                  <button
                    type="button"
                    className={'geo-search__suggestion' + (citySuggestion ? ' is-city' : '')}
                    key={place.id}
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onChooseSuggestion(place)}
                  >
                    {citySuggestion && place.countryCode && (
                      <img
                        className="geo-search__suggestion-flag"
                        src={flagImageUrl(place.countryCode, 40)}
                        alt=""
                        width={24}
                        height={17}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <span className="geo-search__suggestion-copy">
                      <strong>{place.name}</strong>
                      {secondaryText && <small>{secondaryText}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button type="submit" className="geo-search__button" disabled={searching}>
          {searching ? t('searching') : t('search')}
        </button>
      </div>
      {suggesting && query.trim().length >= minChars && !searching && (
        <div className="geo-search__status">{t('searchingSuggestions')}</div>
      )}
      {error && <div className="geo-search__error">{error}</div>}
    </form>
  );
}
