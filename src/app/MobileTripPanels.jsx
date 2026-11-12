import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCalendar,
  IconCheck,
  IconInfoCircle,
  IconMapPin,
  IconMoon,
  IconWallet,
  IconX,
} from '@tabler/icons-react';
import { tripSummary } from '../modules/trips/tripSummaryModel.js';
import { formatMoney } from '../shared/utils.js';
import { BREAKDOWN_CATS, CURRENCIES, displayName, formatTripDateRange } from './TripSummaryHeader.jsx';
import './MobileTripPanels.css';

/**
 * App (móvil): pestaña Configuración con Moneda e Idioma, que antes vivían en
 * la cabecera.
 */
export function TripSettingsPanel({ currency, setCurrency, locale, setLocale, availableLocales, t, intlLocale }) {
  const groups = [
    {
      key: 'currency',
      title: t('currency'),
      value: currency,
      onChange: setCurrency,
      options: CURRENCIES.map((code) => ({ value: code, label: displayName(code, 'currency', intlLocale) })),
    },
    {
      key: 'language',
      title: t('language'),
      value: locale,
      onChange: setLocale,
      options: (availableLocales || []).map((code) => ({ value: code, label: displayName(code, 'language', intlLocale) })),
    },
  ];

  return (
    <section className="trip-settings" aria-label={t('settings')}>
      <h2 className="trip-settings__title">{t('settings')}</h2>
      {groups.map((group) => (
        <div className="trip-settings__group" key={group.key}>
          <h3 className="trip-settings__group-title">{group.title}</h3>
          <div className="trip-settings__list" role="radiogroup" aria-label={group.title}>
            {group.options.map((option) => {
              const selected = option.value === group.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={'trip-settings__option' + (selected ? ' is-selected' : '')}
                  onClick={() => group.onChange?.(option.value)}
                >
                  <strong>{option.value.toUpperCase()}</strong>
                  <span>{option.label}</span>
                  {selected && <IconCheck size={17} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * App (móvil): círculo sobre el mapa con el resto de la antigua cabecera
 * (fechas, total con su desglose, ciudades y noches).
 */
export function TripInfoCapsule({ trip, total, hasCosts, breakdown, t, intlLocale }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const summary = useMemo(() => tripSummary(trip), [trip]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const rows = [
    { key: 'dates', Icon: IconCalendar, label: t('tripDates'), value: formatTripDateRange(summary, intlLocale, t('noTripDates')) },
    { key: 'total', Icon: IconWallet, label: t('grandTotal'), value: formatMoney(total, trip.currency, intlLocale) },
    { key: 'cities', Icon: IconMapPin, label: `${summary.countries} ${t(summary.countries === 1 ? 'country' : 'countries')}`, value: `${summary.destinations} ${t('cities')}` },
    { key: 'nights', Icon: IconMoon, label: t('totalNights'), value: `${summary.nights} ${t('nights')}` },
  ];

  return (
    <div className="trip-info-capsule" ref={rootRef}>
      <button
        type="button"
        className={'trip-info-capsule__button' + (open ? ' is-active' : '')}
        aria-label={t('tripInfo')}
        title={t('tripInfo')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconInfoCircle size={21} aria-hidden="true" />
      </button>

      {open && (
        <div className="trip-info-panel" role="dialog" aria-label={t('tripInfo')}>
          <div className="trip-info-panel__head">
            <span>{t('tripInfo')}</span>
            <button type="button" className="trip-info-panel__close" aria-label={t('close')} onClick={() => setOpen(false)}>
              <IconX size={16} aria-hidden="true" />
            </button>
          </div>
          {rows.map(({ key, Icon, label, value }) => (
            <div key={key} className="trip-info-panel__block">
              <div className="trip-info-panel__row">
                <span className="trip-info-panel__icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="trip-info-panel__copy">
                  <strong>{value}</strong>
                  <small>{label}</small>
                </span>
              </div>
              {key === 'total' && hasCosts && (
                <div className="trip-info-panel__breakdown">
                  {BREAKDOWN_CATS.filter((category) => breakdown?.[category.key] > 0).map((category) => {
                    const amount = breakdown[category.key];
                    const percentage = total > 0 ? Math.round((amount / total) * 100) : 0;
                    const CategoryIcon = category.Icon;
                    return (
                      <div className="trip-info-panel__breakdown-row" key={category.key}>
                        <CategoryIcon size={16} style={{ color: category.color }} aria-hidden="true" />
                        <span>{t(category.labelKey)}</span>
                        <strong>{formatMoney(amount, trip.currency, intlLocale)}</strong>
                        <small>{percentage}%</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
