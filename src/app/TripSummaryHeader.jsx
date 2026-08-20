import { useEffect, useMemo, useRef } from 'react';
import {
  IconBed,
  IconBus,
  IconCalendar,
  IconCar,
  IconChevronDown,
  IconCurrencyDollar,
  IconDots,
  IconMapPin,
  IconMoon,
  IconPlane,
  IconRoute,
  IconTicket,
  IconToolsKitchen2,
  IconTrain,
  IconWallet,
} from '@tabler/icons-react';
import { tripSummary } from '../modules/trips/tripSummaryModel.js';
import { formatMoney } from '../shared/utils.js';

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'];

const BREAKDOWN_CATS = [
  { key: 'plane', labelKey: 'flights', Icon: IconPlane, color: '#e2725b' },
  { key: 'train', labelKey: 'train', Icon: IconTrain, color: '#4f6df5' },
  { key: 'bus', labelKey: 'bus', Icon: IconBus, color: '#e08a17' },
  { key: 'taxiUber', labelKey: 'carTaxi', Icon: IconCar, color: '#5a8f3c' },
  { key: 'lodging', labelKey: 'lodging', Icon: IconBed, color: '#d4a017' },
  { key: 'food', labelKey: 'meals', Icon: IconToolsKitchen2, color: '#2aa866' },
  { key: 'attractions', labelKey: 'attractions', Icon: IconTicket, color: '#9b59b6' },
  { key: 'others', labelKey: 'others', Icon: IconDots, color: '#9499ab' },
];

function formatDateRange(summary, locale, fallback) {
  if (!summary.startDate || !summary.endDate) return fallback;
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: summary.startDate.slice(0, 4) === summary.endDate.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  });
  const start = formatter.format(new Date(`${summary.startDate}T00:00:00Z`));
  const endFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${start} – ${endFormatter.format(new Date(`${summary.endDate}T00:00:00Z`))}`;
}

function Metric({ Icon, iconColor, label, value, className = '', children, onClick, expanded }) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      className={`trip-summary__metric${interactive ? ' is-interactive' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-expanded={interactive ? expanded : undefined}
    >
      <span
        className="trip-summary__metric-icon"
        style={{ color: iconColor }}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>
      <span className="trip-summary__metric-copy">
        <strong className="trip-summary__metric-value">{value}</strong>
        <span className="trip-summary__metric-label">{label}</span>
      </span>
      {children}
    </Tag>
  );
}

function CurrencyMetric({ currency, setCurrency, t }) {
  return (
    <label className="trip-summary__metric trip-summary__metric--currency">
      <span
        className="trip-summary__metric-icon"
        style={{ color: '#c9224d' }}
        aria-hidden="true"
      >
        <IconCurrencyDollar size={18} />
      </span>
      <span className="trip-summary__metric-copy">
        <select
          className="trip-summary__currency trip-summary__metric-value"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          aria-label={t('currency')}
        >
          {CURRENCIES.map((currencyOption) => (
            <option key={currencyOption} value={currencyOption}>{currencyOption}</option>
          ))}
        </select>
        <span className="trip-summary__metric-label">{t('currency')}</span>
      </span>
    </label>
  );
}

export function TripSummaryHeader({
  trip,
  renameTrip,
  setCurrency,
  total,
  hasCosts,
  breakdown,
  showBreakdown,
  setShowBreakdown,
  t,
  intlLocale,
}) {
  const summary = useMemo(() => tripSummary(trip), [trip]);
  const breakdownRef = useRef(null);

  useEffect(() => {
    if (!showBreakdown) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!breakdownRef.current?.contains(event.target)) setShowBreakdown(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [showBreakdown, setShowBreakdown]);

  const dateRange = formatDateRange(summary, intlLocale, t('noTripDates'));
  const distance = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(summary.distanceKm);

  return (
    <header className="trip-summary" aria-label={t('tripSummary')}>
      <div className="trip-summary__identity">
        <input
          type="text"
          className="trip-summary__title"
          value={trip.name || ''}
          maxLength={120}
          placeholder={t('tripNamePlaceholder')}
          aria-label={t('tripName')}
          onChange={(event) => renameTrip(event.target.value)}
        />
        <div className="trip-summary__meta">
          <span className="trip-summary__date"><IconCalendar size={13} aria-hidden="true" />{dateRange}</span>
        </div>
      </div>

      <div className="trip-summary__metrics" aria-label={t('tripMetrics')}>
        <div className="trip-summary__breakdown-anchor" ref={breakdownRef}>
          <Metric
            Icon={IconWallet}
            iconColor="#2aa866"
            label={t('grandTotal')}
            value={formatMoney(total, trip.currency, intlLocale)}
            className="trip-summary__metric--total"
            onClick={() => hasCosts && setShowBreakdown((value) => !value)}
            expanded={showBreakdown}
          >
            {hasCosts && <IconChevronDown size={14} className={showBreakdown ? 'is-open' : ''} aria-hidden="true" />}
          </Metric>

          {showBreakdown && hasCosts && (
            <div className="trip-summary__breakdown" role="region" aria-label={t('grandTotal')}>
              {BREAKDOWN_CATS.filter((category) => breakdown[category.key] > 0).map((category) => {
                const amount = breakdown[category.key];
                const percentage = total > 0 ? Math.round((amount / total) * 100) : 0;
                const CategoryIcon = category.Icon;
                return (
                  <div className="trip-summary__breakdown-row" key={category.key}>
                    <span className="trip-summary__breakdown-icon">
                      <CategoryIcon size={17} style={{ color: category.color }} aria-hidden="true" />
                    </span>
                    <span className="trip-summary__breakdown-name">{t(category.labelKey)}</span>
                    <strong className="trip-summary__breakdown-value">{formatMoney(amount, trip.currency, intlLocale)}</strong>
                    <span className="trip-summary__breakdown-pct">{percentage}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Metric
          Icon={IconMapPin}
          iconColor="#7c5ce7"
          label={t('destinations')}
          value={`${summary.destinations} ${t('cities')}`}
        />
        <Metric
          Icon={IconMoon}
          iconColor="#4f6df5"
          label={t('totalNights')}
          value={`${summary.nights} ${t('nights')}`}
        />
        <Metric
          Icon={IconRoute}
          iconColor="#e08a17"
          label={t('totalDistance')}
          value={`≈ ${distance} km`}
        />
        <CurrencyMetric
          currency={trip.currency}
          setCurrency={setCurrency}
          t={t}
        />
      </div>
    </header>
  );
}
