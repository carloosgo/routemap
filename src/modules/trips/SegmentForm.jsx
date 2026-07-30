import { useState } from 'react';
import {
  IconArrowRight,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { formatMoney } from '../../shared/utils.js';
import { colorForIndex } from '../../config.js';
import { segmentTotal } from './tripModel.js';

export function SegmentForm({
  segment,
  index,
  currency,
  locale,
  expanded,
  dragging,
  onToggle,
  onUpdate,
  onUpdateExpenses,
  onRemove,
  onOpenNote,
  onReorderPointerStart,
  onReorderKeyDown,
}) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const total = segmentTotal(segment);
  const bodyId = `segment-body-${segment.id}`;

  const formattedDates =
    segment.startDate || segment.endDate
      ? [
          segment.startDate
            ? new Date(`${segment.startDate}T00:00:00`).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
              })
            : '—',
          segment.endDate
            ? new Date(`${segment.endDate}T00:00:00`).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
              })
            : '—',
        ].join(' – ')
      : null;

  return (
    <article
      className={'segment' + (dragging ? ' is-dragging' : '')}
      data-segment-id={segment.id}
    >
      <header className="segment__header">
        <button
          type="button"
          className="segment__badge"
          style={{
            background: colorForIndex(index),
            border: 0,
            padding: 0,
            cursor: dragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          aria-label={`${t('moveSegment')} ${index + 1}`}
          aria-pressed={dragging}
          title={t('moveSegmentHint')}
          onPointerDown={onReorderPointerStart}
          onKeyDown={onReorderKeyDown}
        >
          {index + 1}
        </button>

        <div className="segment__route">
          <CityAutocomplete
            value={segment.origin}
            onSelect={(city) => onUpdate({ origin: city })}
            placeholder={t('origin')}
          />
          <IconArrowRight size={12} className="segment__arrow" aria-hidden="true" />
          <CityAutocomplete
            value={segment.destination}
            onSelect={(city) => onUpdate({ destination: city })}
            placeholder={t('destination')}
          />
          {formattedDates && <span className="segment__dates">{formattedDates}</span>}
        </div>

        <span className="segment__pill">{formatMoney(total, currency, locale)}</span>

        <button
          type="button"
          className={'btn btn--icon segment__note-btn' + (segment.note ? ' has-note' : '')}
          aria-label={t('segmentNote')}
          title={t('segmentNote')}
          onClick={onOpenNote}
        >
          <IconNote size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn--icon segment__toggle"
          aria-label={expanded ? t('collapse') : t('expand')}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {expanded ? (
            <IconChevronUp size={14} aria-hidden="true" />
          ) : (
            <IconChevronDown size={14} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('removeSegment')}
          onClick={() => setConfirmOpen(true)}
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      </header>

      {expanded && (
        <div className="segment__body" id={bodyId}>
          <div className="dates">
            <span className="dates__label">
              <IconCalendar size={12} aria-hidden="true" /> {t('startDate')} / {t('endDate')}
            </span>
            <div className="dates__row">
              <input
                type="date"
                className="input"
                value={segment.startDate}
                onChange={(event) => onUpdate({ startDate: event.target.value })}
              />
              <IconArrowRight size={13} className="dates__arrow" aria-hidden="true" />
              <input
                type="date"
                className="input"
                value={segment.endDate}
                min={segment.startDate || undefined}
                onChange={(event) => onUpdate({ endDate: event.target.value })}
              />
            </div>
          </div>

          <ExpenseEditor
            expenses={segment.expenses}
            currency={currency}
            locale={locale}
            onChange={onUpdateExpenses}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message={t('confirmDeleteSegment')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </article>
  );
}
