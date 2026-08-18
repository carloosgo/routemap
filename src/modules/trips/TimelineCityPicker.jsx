import { useEffect, useRef, useState } from 'react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';

export function TimelineCityPicker({ city, onSelect, placeholder }) {
  const [editing, setEditing] = useState(!city);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!city) setEditing(true);
  }, [city]);

  useEffect(() => {
    if (!editing) return undefined;

    function closeOnOutsideClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setEditing(Boolean(!city));
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [city, editing]);

  if (editing) {
    return (
      <div className="timeline-city-picker is-editing" ref={wrapRef}>
        <CityAutocomplete
          value={city}
          onSelect={(nextCity) => {
            onSelect(nextCity);
            setEditing(false);
          }}
          placeholder={placeholder}
          autoFocus
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="timeline-city-picker__display"
      onClick={() => setEditing(true)}
      title={city?.name || placeholder}
    >
      <span className="timeline-city-picker__name">{city?.name || placeholder}</span>
      {city?.country && (
        <span className="timeline-city-picker__country">{city.country}</span>
      )}
    </button>
  );
}
