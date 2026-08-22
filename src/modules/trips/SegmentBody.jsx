import { CalendarDateInput } from '../../components/CalendarDateInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';
import { isValidSegmentDateRange } from './segmentFormModel.js';

export function SegmentBody({
  segment,
  currency,
  locale,
  bodyId,
  onUpdate,
  onUpdateExpenses,
}) {
  const { t } = useTranslation();

  function updateDate(patch) {
    const startDate = Object.hasOwn(patch, 'startDate') ? patch.startDate : segment.startDate;
    const endDate = Object.hasOwn(patch, 'endDate') ? patch.endDate : segment.endDate;
    if (!isValidSegmentDateRange(startDate, endDate)) return;
    onUpdate(patch);
  }

  return (
    <div className="segment__body segment-expense-form" id={bodyId}>
      <div className="dates">
        <div className="dates__row">
          <CalendarDateInput
            value={segment.startDate}
            max={segment.endDate || undefined}
            locale={locale}
            ariaLabel={t('startDate')}
            onChange={(startDate) => updateDate({ startDate })}
          />
          <CalendarDateInput
            value={segment.endDate}
            min={segment.startDate || undefined}
            locale={locale}
            ariaLabel={t('endDate')}
            align="end"
            onChange={(endDate) => updateDate({ endDate })}
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
  );
}
