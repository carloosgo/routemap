import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconX,
} from '@tabler/icons-react';
import { useTranslation } from '../i18n/index.jsx';
import './CalendarDateInput.css';

function parseIsoDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function sameDay(left, right) {
  return Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
  );
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function calendarDays(month, weekStartsOnMonday) {
  const first = startOfMonth(month);
  const weekday = first.getDay();
  const offset = weekStartsOnMonday ? (weekday + 6) % 7 : weekday;
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  );
}

export function CalendarDateInput({
  value,
  min,
  max,
  referenceDate,
  locale = 'es-MX',
  onChange,
  ariaLabel,
  align = 'start',
}) {
  const { t } = useTranslation();
  const rootRef = useRef(null);
  const popupId = useId();
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const minDate = useMemo(() => parseIsoDate(min), [min]);
  const maxDate = useMemo(() => parseIsoDate(max), [max]);
  const referenceMonthDate = useMemo(() => parseIsoDate(referenceDate), [referenceDate]);
  const calendarAnchor = selectedDate || minDate || referenceMonthDate || maxDate || new Date();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(calendarAnchor));
  const isEnglish = locale.toLowerCase().startsWith('en');
  const weekStartsOnMonday = !isEnglish;

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setViewMonth(startOfMonth(calendarAnchor));
  }, [open, selectedDate, minDate, maxDate, referenceMonthDate]);

  const monthLabel = capitalize(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewMonth)
  );

  const weekdayLabels = useMemo(() => {
    const firstDay = weekStartsOnMonday ? new Date(2024, 0, 1) : new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(
        firstDay.getFullYear(),
        firstDay.getMonth(),
        firstDay.getDate() + index
      );
      return new Intl.DateTimeFormat(locale, { weekday: 'short' })
        .format(date)
        .replace('.', '');
    });
  }, [locale, weekStartsOnMonday]);

  const days = useMemo(
    () => calendarDays(viewMonth, weekStartsOnMonday),
    [viewMonth, weekStartsOnMonday]
  );

  const displayValue = selectedDate
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(selectedDate)
    : '';

  const placeholder = t('datePlaceholder');
  const previousMonth = addMonths(viewMonth, -1);
  const nextMonth = addMonths(viewMonth, 1);
  const previousMonthEnd = new Date(
    previousMonth.getFullYear(),
    previousMonth.getMonth() + 1,
    0
  );
  const previousDisabled = Boolean(
    minDate && startOfDay(previousMonthEnd) < startOfDay(minDate)
  );
  const nextDisabled = Boolean(
    maxDate && startOfDay(nextMonth) > startOfDay(maxDate)
  );

  function selectDate(date) {
    if (minDate && startOfDay(date) < startOfDay(minDate)) return;
    if (maxDate && startOfDay(date) > startOfDay(maxDate)) return;
    onChange(toIsoDate(date));
    setOpen(false);
  }

  return (
    <div
      className={'calendar-date' + (align === 'end' ? ' calendar-date--end' : '')}
      ref={rootRef}
    >
      <button
        type="button"
        className={'input calendar-date__trigger' + (open ? ' is-open' : '')}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={displayValue ? 'calendar-date__value' : 'calendar-date__placeholder'}>
          {displayValue || placeholder}
        </span>
        <IconCalendar size={14} aria-hidden="true" />
      </button>

      {value && (
        <button
          type="button"
          className="calendar-date__clear"
          aria-label={t('clearDate')}
          onClick={(event) => {
            event.stopPropagation();
            onChange('');
            setOpen(false);
          }}
        >
          <IconX size={11} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          className="calendar-date__popover"
          id={popupId}
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className="calendar-date__header">
            <button
              type="button"
              className="calendar-date__month-button"
              aria-label={t('previousMonth')}
              disabled={previousDisabled}
              onClick={() => setViewMonth(previousMonth)}
            >
              <IconChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              className="calendar-date__month-button"
              aria-label={t('nextMonth')}
              disabled={nextDisabled}
              onClick={() => setViewMonth(nextMonth)}
            >
              <IconChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="calendar-date__weekdays" aria-hidden="true">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="calendar-date__days">
            {days.map((date) => {
              const disabled = Boolean(
                (minDate && startOfDay(date) < startOfDay(minDate)) ||
                (maxDate && startOfDay(date) > startOfDay(maxDate))
              );
              const outside = date.getMonth() !== viewMonth.getMonth();
              const selected = sameDay(date, selectedDate);
              const today = sameDay(date, new Date());
              const label = new Intl.DateTimeFormat(locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(date);

              return (
                <button
                  type="button"
                  key={toIsoDate(date)}
                  className={
                    'calendar-date__day' +
                    (outside ? ' is-outside' : '') +
                    (today ? ' is-today' : '') +
                    (selected ? ' is-selected' : '')
                  }
                  disabled={disabled}
                  aria-label={label}
                  aria-pressed={selected}
                  aria-current={today ? 'date' : undefined}
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
