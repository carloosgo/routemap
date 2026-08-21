import { useEffect, useMemo, useRef } from 'react';
import {
  IconBed,
  IconBus,
  IconCar,
  IconChevronDown,
  IconCurrencyDollar,
  IconDots,
  IconLanguage,
  IconMap2,
  IconMapPin,
  IconMoon,
  IconPlane,
  IconRoute,
  IconToolsKitchen2,
  IconTrain,
  IconWallet,
} from '@tabler/icons-react';
import { tripSummary } from '../modules/trips/tripSummaryModel.js';
import { formatMoney } from '../shared/utils.js';
import { SummarySelectorMetric } from './SummarySelectorMetric.jsx';
import { TripHeaderNavigation } from './TripHeaderNavigation.jsx';

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'];

const BREAKDOWN_CATS = [
  { key: 'plane', labelKey: 'flights', Icon: IconPlane, color: '#e2725b' },
  { key: 'train', labelKey: 'train', Icon: IconTrain, color: '#4f6df5' },
  { key: 'bus', labelKey: 'bus', Icon: IconBus, color: '#e08a17' },
  { key: 'taxiUber', labelKey: 'taxi', Icon: IconCar, color: '#5a8f3c' },
  { key: 'lodging', labelKey: 'lodging', Icon: IconBed, color: '#d4a017' },
  { key: 'food', labelKey: 'food', Icon: IconToolsKitchen2, color: '#2aa866' },
  { key: 'others', labelKey: 'others', Icon: IconDots, color: '#9499ab' },
];

function displayName(code, type, locale) {
  try {
    const name = new Intl.DisplayNames([locale], { type }).of(code);
    if (!name) return code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code;
  }
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

export function TripSummaryHeader({
  trip,
  navigation,
  setCurrency,
  locale,
  setLocale,
  availableLocales,
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
  const currencyOptions = useMemo(
    () => CURRENCIES.map((code) => ({
      value: code,
      label: displayName(code, 'currency', intlLocale),
    })),
    [intlLocale]
  );
  const languageOptions = useMemo(
    () => availableLocales.map((code) => ({
      value: code,
      label: displayName(code, 'language', intlLocale),
    })),
    [availableLocales, intlLocale]
  );

  useEffect(() => {
    if (!showBreakdown) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!breakdownRef.current?.contains(event.target)) setShowBreakdown(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [showBreakdown, setShowBreakdown]);

  const distance = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(summary.distanceKm);

  return (
    <header className="trip-summary" aria-label={t('tripSummary')}>
      <div className="trip-summary__brand" aria-label={t('appName')}>
        <span className="trip-summary__brand-icon" aria-hidden="true">
          <IconMap2 size={14} />
        </span>
        <span className="trip-summary__brand-name">{t('appName')}</span>
      </div>

      <div className="trip-summary__identity">
        <TripHeaderNavigation {...navigation} t={t} />
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

        <Metric Icon={IconMapPin} iconColor="#7c5ce7" label={t('destinations')} value={`${summary.destinations} ${t('cities')}`} />
        <Metric Icon={IconMoon} iconColor="#4f6df5" label={t('totalNights')} value={`${summary.nights} ${t('nights')}`} />
        <Metric Icon={IconRoute} iconColor="#e08a17" label={t('totalDistance')} value={`≈ ${distance} km`} />
        <SummarySelectorMetric Icon={IconCurrencyDollar} iconColor="#c9224d" label={t('currency')} value={trip.currency} options={currencyOptions} onChange={setCurrency} menuClassName="trip-summary__selector-menu--currency" />
        <SummarySelectorMetric Icon={IconLanguage} iconColor="#357d94" label={t('language')} value={locale} options={languageOptions} onChange={setLocale} menuClassName="trip-summary__selector-menu--language" />
      </div>
    </header>
  );
}
