import { useState, useRef, useEffect } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { useCitySearch } from '../modules/geocoding/useCitySearch.js';
import { flagImageUrl } from '../modules/flags/flags.js';
import { useTranslation } from '../i18n/index.jsx';
import { config } from '../config.js';

// Campo de búsqueda de ciudad con autocompletado.
// Muestra sugerencias a partir del 3er carácter y devuelve un City completo.
export function CityAutocomplete({ value, onSelect, placeholder, selectedDisplay = 'full' }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const { results, loading, error } = useCitySearch(open ? query : '');
  const flagOnlySelected = selectedDisplay === 'flag-only' && Boolean(value) && !open;
  const timelineSelected = selectedDisplay === 'timeline' && Boolean(value) && !open;
  const displayValue = open ? query : flagOnlySelected ? '' : value?.name || '';

  useEffect(() => {
    function onClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setHighlight(-1);
      }
    }
    document.addEventListener('pointerdown', onClickOutside);
    return () => document.removeEventListener('pointerdown', onClickOutside);
  }, []);

  function handleChange(event) {
    setQuery(event.target.value);
    setOpen(true);
    setHighlight(-1);
  }

  function handleSelect(city) {
    if (!city) return;
    onSelect(city);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(event) {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault();
      handleSelect(results[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  }

  const showHint =
    open && query.trim().length > 0 && query.trim().length < config.citySearchMinChars;

  return (
    <div
      className={
        'autocomplete' +
        (open ? ' is-open' : '') +
        (flagOnlySelected ? ' autocomplete--flag-only-selected' : '') +
        (timelineSelected ? ' autocomplete--timeline-selected' : '')
      }
      ref={containerRef}
    >
      <div className="autocomplete__field" onClick={() => inputRef.current?.focus()}>
        {value?.countryCode ? (
          <img
            className={'flag' + (open ? ' flag--dim' : '')}
            src={flagImageUrl(value.countryCode, 40)}
            alt={value.countryCode}
            width={20}
            height={14}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <IconSearch size={14} className="autocomplete__search-icon" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="input"
          value={displayValue}
          placeholder={flagOnlySelected ? '' : placeholder || t('searchCity')}
          aria-label={placeholder || t('searchCity')}
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
        />
        {timelineSelected && (
          <span className="autocomplete__selected-value" aria-hidden="true">
            {value?.name}
          </span>
        )}
      </div>

      {open && (query.trim().length >= config.citySearchMinChars || loading) && (
        <ul className="autocomplete__list" role="listbox">
          {loading && <li className="autocomplete__status">{t('searching')}</li>}
          {error && (
            <li className="autocomplete__status autocomplete__status--error">{error}</li>
          )}
          {!loading && !error && results.length === 0 && (
            <li className="autocomplete__status">{t('noResults')}</li>
          )}
          {results.map((city, index) => (
            <li key={city.id} className="autocomplete__item-row" role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={'autocomplete__item' + (index === highlight ? ' is-active' : '')}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => handleSelect(city)}
              >
                {city.countryCode && (
                  <img
                    className="flag"
                    src={flagImageUrl(city.countryCode, 40)}
                    alt={city.countryCode}
                    width={24}
                    height={17}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span className="autocomplete__cityinfo">
                  <span className="autocomplete__name">{city.name}</span>
                  {city.country && <span className="autocomplete__meta">, {city.country}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showHint && (
        <div className="autocomplete__hint">
          {config.citySearchMinChars}+ {t('searchCity')}
        </div>
      )}
    </div>
  );
}
