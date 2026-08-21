import { IconX } from '@tabler/icons-react';
import { CalendarDateInput } from '../../components/CalendarDateInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';
import './OriginOptions.css';

export function OriginBody({
  details,
  currency,
  locale,
  bodyId,
  showNote,
  onCloseNote,
  onUpdate,
  onUpdateExpenses,
}) {
  const { t } = useTranslation();
  const originNoteLabel = `${t('segmentNote')}: ${t('origin')}`;

  return (
    <div className="segment__body segment-expense-form itinerary-origin__body" id={bodyId}>
      <div className="dates dates--origin">
        <div className="dates__row">
          <CalendarDateInput
            value={details.departureDate}
            locale={locale}
            ariaLabel={t('departureDate')}
            onChange={(departureDate) => onUpdate({ departureDate })}
          />
        </div>
      </div>

      {showNote && (
        <div className="itinerary-origin__note-editor">
          <div className="itinerary-origin__note-editor-head">
            <span>{originNoteLabel}</span>
            <button
              type="button"
              className="btn btn--icon itinerary-origin__note-editor-close"
              aria-label={t('closeNote')}
              onClick={onCloseNote}
            >
              <IconX size={14} aria-hidden="true" />
            </button>
          </div>
          <textarea
            className="itinerary-origin__note-textarea"
            maxLength={500}
            aria-label={originNoteLabel}
            placeholder={t('segmentNotePlaceholder')}
            value={details.note || ''}
            onChange={(event) => onUpdate({ note: event.target.value })}
            autoFocus
          />
          <span className="itinerary-origin__note-count">
            {(details.note || '').length} / 500
          </span>
        </div>
      )}

      <ExpenseEditor
        expenses={details.expenses}
        currency={currency}
        locale={locale}
        onChange={onUpdateExpenses}
      />
    </div>
  );
}
