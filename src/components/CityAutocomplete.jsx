import { useState, useRef, useEffect } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { useCitySearch } from '../modules/geocoding/useCitySearch.js';
import { flagImageUrl } from '../modules/flags/flags.js';
import { useTranslation } from '../i18n/index.jsx';
import { config } from '../config.js';

// Campo de búsqueda de ciudad con autocompletado.
// Muestra sugerencias a partir del 3er carácter y la bandera de cada país.
// Al seleccionar, devuelve un objeto City completo (con lat/lon/countryCode).
export function CityAutocomplete({
  value,
  onSelect,
  placeholder,
  selectedDisplay = 'full',
  fitSelectedText = false,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const { results, loading, error } = useCitySearch(open ? query : '');
  const flagOnlySelected = selectedDisplay === 'flag-only' && Boolean(value) && !open;
  const displayValue = open ? query : flagOnlySelected ? '' : value?.name || '';
  const inputSize = fitSelectedText
    ? Math.max((displayValue || placeholder || t('searchCity')).length, 6)
    : undefined;

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    setHighlight(-1);
  }

  function handleSelect(city) {
    onSelect(city);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      handleSelect(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showHint =
    open && query.trim().length > 0 && query.trim().length < config.citySearchMinChars;

  return (
    <div
      className={
        'autocomplete' +
        (flagOnlySelected ? ' autocomplete--flag-only-selected' : '') +
        (fitSelectedText ? ' autocomplete--fit-selected' : '')
      }
      ref={containerRef}
    >
      <div className="autocomplete__field" onClick={() => inputRef.current?.focus()}>
        {value?.countryCode ? (
          <img
            className={'flag' + (open ? ' flag--dim' : '')}
            src={flagImageUrl(value.countryCode, 20)}
            alt={value.countryCode}
            width={20}
            height={14}
            loading="lazy"
          />
        ) : (
          <IconSearch size={14} className="autocomplete__search-icon" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="input"
          size={inputSize}
          value={displayValue}
          placeholder={flagOnlySelected ? '' : placeholder || t('searchCity')}
          aria-label={placeholder || t('searchCity')}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
        />
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
          {results.map((city, i) => (
            <li
              key={city.id}
              role="option"
              aria-selected={i === highlight}
              className={'autocomplete__item' + (i === highlight ? ' is-active' : '')}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(city);
              }}
            >
              {city.countryCode && (
                <img
                  className="flag"
                  src={flagImageUrl(city.countryCode, 20)}
                  alt={city.countryCode}
                  width={20}
                  height={14}
                  loading="lazy"
                />
              )}
              <span className="autocomplete__cityinfo">
                <span className="autocomplete__name">{city.name}</span>
                {city.country && <span className="autocomplete__meta">, {city.country}</span>}
              </span>
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
