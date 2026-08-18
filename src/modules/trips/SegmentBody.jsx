import { IconArrowRight, IconCalendar } from '@tabler/icons-react';
import { CalendarDateInput } from '../../components/CalendarDateInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';

export function SegmentBody({
  segment,
  currency,
  locale,
  bodyId,
  onUpdate,
  onUpdateExpenses,
}) {
  const { t } = useTranslation();

  return (
    <div className="segment__body" id={bodyId}>
      <div className="dates">
        <span className="dates__label">
          <IconCalendar size={12} aria-hidden="true" /> {t('startDate')} / {t('endDate')}
        </span>
        <div className="dates__row">
          <CalendarDateInput
            value={segment.startDate}
            locale={locale}
            ariaLabel={t('startDate')}
            onChange={(startDate) => onUpdate({ startDate })}
          />
          <IconArrowRight size={13} className="dates__arrow" aria-hidden="true" />
          <CalendarDateInput
            value={segment.endDate}
            min={segment.startDate || undefined}
            locale={locale}
            ariaLabel={t('endDate')}
            align="end"
            onChange={(endDate) => onUpdate({ endDate })}
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
