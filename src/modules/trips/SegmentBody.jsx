import { CalendarDateInput } from '../../components/CalendarDateInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';

export function SegmentBody({
  segment,
  currency,
  locale,
  bodyId,
  dateError = '',
  onUpdate,
  onUpdateExpenses,
}) {
  const { t } = useTranslation();

  return (
    <div className="segment__body segment-expense-form" id={bodyId}>
      <div className="dates">
        <div className="dates__row">
          <CalendarDateInput
            value={segment.startDate}
            max={segment.endDate || undefined}
            locale={locale}
            ariaLabel={t('startDate')}
            onChange={(startDate) => onUpdate({ startDate })}
          />
          <CalendarDateInput
            value={segment.endDate}
            min={segment.startDate || undefined}
            locale={locale}
            ariaLabel={t('endDate')}
            align="end"
            onChange={(endDate) => onUpdate({ endDate })}
          />
        </div>
        {dateError && (
          <p className="segment-details-modal__date-error" role="alert">
            {dateError}
          </p>
        )}
      </div>

      <ExpenseEditor
        expenses={segment.expenses}
        currency={currency}
        locale={locale}
        onChange={onUpdateExpenses}
      />
    </div>
  );
}
