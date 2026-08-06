import { useTranslation } from '../../i18n/index.jsx';
import { formatMoney } from '../../shared/utils.js';
import { expensesTotal } from './expenseModel.js';
import { EXPENSE_ICONS, transportOtherIcon } from './expenseEditorCatalog.jsx';
import {
  appendExpenseItem,
  patchExpenses,
  patchFood,
  patchTransport,
  removeExpenseItem,
  updateExpenseItem,
  usesDetailedFood,
} from './expenseEditorOperations.js';
import { ExpenseLineItemsGrid } from './ExpenseLineItemsGrid.jsx';
import { FixedExpenseCards } from './FixedExpenseCards.jsx';

export function ExpenseEditor({ expenses, currency, locale, onChange }) {
  const { t } = useTranslation();
  const detailedFood = usesDetailedFood(expenses);

  const apply = (nextExpenses) => onChange(nextExpenses);
  const onPatch = (part) => apply(patchExpenses(expenses, part));
  const onSetFood = (part) => apply(patchFood(expenses, part));
  const onSetTransport = (mode, amount) =>
    apply(patchTransport(expenses, mode, amount));
  const onAddItem = (key) => apply(appendExpenseItem(expenses, key));
  const onUpdateItem = (key, id, field, value) =>
    apply(updateExpenseItem(expenses, key, id, field, value));
  const onRemoveItem = (key, id) => apply(removeExpenseItem(expenses, key, id));

  return (
    <div className="expenses">
      <div className="expenses__toggle">
        <span className="expenses__togglelabel">{t('food')}:</span>
        <div className="toggle">
          <button
            type="button"
            className={'toggle__btn' + (!detailedFood ? ' is-active' : '')}
            onClick={() => onSetFood({ mode: 'single' })}
          >
            {t('foodSingle')}
          </button>
          <button
            type="button"
            className={'toggle__btn' + (detailedFood ? ' is-active' : '')}
            onClick={() => onSetFood({ mode: 'detailed' })}
          >
            {t('foodDetailed')}
          </button>
        </div>
      </div>

      <FixedExpenseCards
        expenses={expenses}
        detailedFood={detailedFood}
        t={t}
        onPatch={onPatch}
        onSetFood={onSetFood}
        onSetTransport={onSetTransport}
      />

      <ExpenseLineItemsGrid
        title={t('otherTransport')}
        items={expenses.transportOthers}
        getIcon={transportOtherIcon}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('addItem')}
        onAdd={() => onAddItem('transportOthers')}
        onUpdate={(id, field, value) =>
          onUpdateItem('transportOthers', id, field, value)
        }
        onRemove={(id) => onRemoveItem('transportOthers', id)}
      />
      <ExpenseLineItemsGrid
        title={t('attractions')}
        items={expenses.attractions}
        getIcon={() => EXPENSE_ICONS.attraction}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('addItem')}
        onAdd={() => onAddItem('attractions')}
        onUpdate={(id, field, value) => onUpdateItem('attractions', id, field, value)}
        onRemove={(id) => onRemoveItem('attractions', id)}
      />
      <ExpenseLineItemsGrid
        title={t('otherExpenses')}
        items={expenses.others}
        getIcon={() => EXPENSE_ICONS.other}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('addItem')}
        onAdd={() => onAddItem('others')}
        onUpdate={(id, field, value) => onUpdateItem('others', id, field, value)}
        onRemove={(id) => onRemoveItem('others', id)}
      />

      <div className="expenses__total">
        <span>{t('segmentTotal')}</span>
        <strong>{formatMoney(expensesTotal(expenses), currency, locale)}</strong>
      </div>
    </div>
  );
}
