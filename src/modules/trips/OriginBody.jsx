import { CalendarDateInput } from '../../components/CalendarDateInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';
import './OriginOptions.css';

export function OriginBody({
  details,
  currency,
  locale,
  bodyId,
  onUpdate,
  onUpdateExpenses,
}) {
  const { t } = useTranslation();

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

      <ExpenseEditor
        expenses={details.expenses}
        currency={currency}
        locale={locale}
        onChange={onUpdateExpenses}
      />
    </div>
  );
}
