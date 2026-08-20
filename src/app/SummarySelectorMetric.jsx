import { useEffect, useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';

export function SummarySelectorMetric({
  Icon,
  iconColor,
  label,
  value,
  options,
  onChange,
  menuClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className="trip-summary__metric trip-summary__metric--selector"
      ref={rootRef}
    >
      <span
        className="trip-summary__metric-icon"
        style={{ color: iconColor }}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>

      <span className="trip-summary__metric-copy">
        <button
          type="button"
          className="trip-summary__selector-trigger trip-summary__metric-value"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{value}</span>
          <IconChevronDown
            size={12}
            className={open ? 'is-open' : ''}
            aria-hidden="true"
          />
        </button>
        <span className="trip-summary__metric-label">{label}</span>
      </span>

      {open && (
        <div
          className={`trip-summary__selector-menu${menuClassName ? ` ${menuClassName}` : ''}`}
          id={listboxId}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                type="button"
                className={`trip-summary__selector-option${active ? ' is-active' : ''}`}
                key={option.value}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="trip-summary__selector-code">{option.value.toUpperCase()}</span>
                <span className="trip-summary__selector-name">{option.label}</span>
                <span className="trip-summary__selector-check" aria-hidden="true">
                  {active && <IconCheck size={14} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
