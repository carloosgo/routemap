import { useCallback, useState } from 'react';
import { IconFileTypePdf, IconMap2 } from '@tabler/icons-react';
import { colorForIndex } from '../config.js';
import { formatMoney } from '../shared/utils.js';
import './ItineraryPdfExport.css';

const PREPARE_EXPORT_EVENT = 'atlas:prepare-itinerary-export';
const RESTORE_EXPORT_EVENT = 'atlas:restore-itinerary-export';

function afterLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function safeDocumentTitle(value) {
  return String(value || 'Atlas')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(iso, locale, { year = false } = {}) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(date).replace(/\./g, '');
  } catch {
    return iso;
  }
}

function formatDateRange(startDate, endDate, locale, emptyLabel) {
  const start = formatDate(startDate, locale);
  const end = formatDate(endDate, locale);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || emptyLabel;
}

function stopDateRange(stop, locale, emptyLabel) {
  return formatDateRange(stop.startDate, stop.endDate, locale, emptyLabel);
}

export function ItineraryPdfExportButton({ model, t }) {
  const [printing, setPrinting] = useState(false);
  const exportLabel = `${t('itinerary')} · PDF`;

  const exportPdf = useCallback(async () => {
    if (printing || typeof document === 'undefined' || typeof globalThis.print !== 'function') return;
    setPrinting(true);
    const root = document.documentElement;
    const previousTitle = document.title;

    try {
      root.classList.add('itinerary-pdf-export');
      document.title = `${safeDocumentTitle(model.name || t('unnamedTrip'))} · ${t('appName')}`;
      await afterLayout();
      globalThis.dispatchEvent(new Event('resize'));
      globalThis.dispatchEvent(new CustomEvent(PREPARE_EXPORT_EVENT));
      await wait(650);
      await afterLayout();
      globalThis.print();
    } finally {
      root.classList.remove('itinerary-pdf-export');
      document.title = previousTitle;
      await afterLayout();
      globalThis.dispatchEvent(new Event('resize'));
      globalThis.dispatchEvent(new CustomEvent(RESTORE_EXPORT_EVENT));
      setPrinting(false);
    }
  }, [model.name, printing, t]);

  return (
    <button
      type="button"
      className="itinerary-pdf-export__button"
      onClick={exportPdf}
      aria-label={exportLabel}
      title={exportLabel}
      disabled={printing}
    >
      <IconFileTypePdf size={21} aria-hidden="true" />
    </button>
  );
}

export function ItineraryPdfSummary({ model, intlLocale, t }) {
  const { summary } = model;
  const dates = formatDateRange(summary.startDate, summary.endDate, intlLocale, t('noTripDates'));
  const cityCountryValue = `${summary.destinations} ${t('cities')} · ${summary.countries} ${t(summary.countries === 1 ? 'country' : 'countries')}`;

  return (
    <section className="itinerary-pdf-export__summary" aria-hidden="true">
      <div className="itinerary-pdf-export__brand">
        <span className="itinerary-pdf-export__brand-icon"><IconMap2 size={15} /></span>
        <span>{t('appName')}</span>
      </div>
      <div className="itinerary-pdf-export__title-row">
        <div>
          <div className="itinerary-pdf-export__eyebrow">{t('itinerary')}</div>
          <h1>{model.name || t('unnamedTrip')}</h1>
        </div>
        <span className="itinerary-pdf-export__map-label">{t('mapRegion')}</span>
      </div>
      <div className="itinerary-pdf-export__metrics">
        <div><span>{t('tripDates')}</span><strong>{dates}</strong></div>
        <div><span>{t('grandTotal')}</span><strong>{formatMoney(model.total, model.currency, intlLocale)}</strong></div>
        <div><span>{t('destinations')}</span><strong>{cityCountryValue}</strong></div>
        <div><span>{t('totalNights')}</span><strong>{summary.nights} {t('nights')}</strong></div>
      </div>
    </section>
  );
}

function RouteLegend({ model, t }) {
  return (
    <div className="itinerary-pdf-export__legend" aria-hidden="true">
      <div className="itinerary-pdf-export__legend-origin">
        <span className="itinerary-pdf-export__origin-mark" />
        <strong>{t('origin')}</strong>
        <span>{model.origin.name || t('origin')}</span>
      </div>
      {model.stops.map((stop) => (
        <div className="itinerary-pdf-export__legend-stop" key={stop.key}>
          <span className="itinerary-pdf-export__number" style={{ background: colorForIndex(stop.number) }}>
            {stop.number}
          </span>
          <span>{stop.name || t('city')}</span>
        </div>
      ))}
    </div>
  );
}

function NoteCard({ stop, intlLocale, t }) {
  const note = stop.note.trim();
  return (
    <article className="itinerary-pdf-export__note-card">
      <header>
        <span className="itinerary-pdf-export__number" style={{ background: colorForIndex(stop.number) }}>
          {stop.number}
        </span>
        <div>
          <h3>{stop.name || t('city')}</h3>
          <p>
            {[stop.country, stopDateRange(stop, intlLocale, t('noTripDates'))]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>
      <div className={note ? 'itinerary-pdf-export__note' : 'itinerary-pdf-export__note is-empty'}>
        {note || '—'}
      </div>
    </article>
  );
}

export function ItineraryPdfDetails({ model, intlLocale, t }) {
  const originNote = model.origin.note.trim();
  const originMeta = [
    model.origin.country,
    formatDate(model.origin.departureDate, intlLocale),
  ].filter(Boolean).join(' · ');

  return (
    <>
      <RouteLegend model={model} t={t} />
      <section className="itinerary-pdf-export__notes" aria-hidden="true">
        <div className="itinerary-pdf-export__notes-heading">
          <span>{t('itinerary')} · {t('notes')}</span>
          <strong>{model.name || t('unnamedTrip')}</strong>
        </div>
        <div className="itinerary-pdf-export__notes-grid">
          <article className="itinerary-pdf-export__note-card itinerary-pdf-export__note-card--origin">
            <header>
              <span className="itinerary-pdf-export__origin-mark" />
              <div>
                <h3>{t('origin')}: {model.origin.name || t('origin')}</h3>
                {originMeta && <p>{originMeta}</p>}
              </div>
            </header>
            <div className={originNote ? 'itinerary-pdf-export__note' : 'itinerary-pdf-export__note is-empty'}>
              {originNote || '—'}
            </div>
          </article>
          {model.stops.map((stop) => (
            <NoteCard key={stop.key} stop={stop} intlLocale={intlLocale} t={t} />
          ))}
        </div>
      </section>
    </>
  );
}
