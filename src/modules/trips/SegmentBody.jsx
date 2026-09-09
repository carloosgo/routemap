import { ExpenseEditor } from '../expenses/ExpenseEditor.jsx';

export function SegmentBody({
  segment,
  currency,
  locale,
  bodyId,
  onUpdateExpenses,
}) {
  return (
    <div className="segment__body segment-expense-form" id={bodyId}>
      <ExpenseEditor
        expenses={segment.expenses}
        currency={currency}
        locale={locale}
        onChange={onUpdateExpenses}
      />
    </div>
  );
}
