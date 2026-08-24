import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';

const HEADER_POPOVER_GAP = 8;

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
  const [menuPosition, setMenuPosition] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function positionMenu() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const headerRect = rootRef.current?.closest('.trip-summary')?.getBoundingClientRect();
      const headerBottom = headerRect?.bottom ?? rect.bottom;
      setMenuPosition({
        top: Math.round(headerBottom + HEADER_POPOVER_GAP),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      });
    }

    function closeOnOutsidePointer(event) {
      const insideTrigger = rootRef.current?.contains(event.target);
      const insideMenu = menuRef.current?.contains(event.target);
      if (!insideTrigger && !insideMenu) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    positionMenu();
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  const menu = open && menuPosition && (
    <div
      className={`trip-summary__selector-menu${menuClassName ? ` ${menuClassName}` : ''}`}
      id={listboxId}
      ref={menuRef}
      role="listbox"
      aria-label={label}
      style={{ top: menuPosition.top, right: menuPosition.right }}
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
  );

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
          <span>{value.toUpperCase()}</span>
          <IconChevronDown
            size={12}
            className={open ? 'is-open' : ''}
            aria-hidden="true"
          />
        </button>
        <span className="trip-summary__metric-label">{label}</span>
      </span>

      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
