import { useTranslation } from '../../i18n/index.jsx';
import { getCurrencySymbol } from '../../shared/utils.js';
import { foodTotal } from './expenseModel.js';
import { EXPENSE_ICONS, transportOtherIcon } from './expenseEditorCatalog.jsx';
import {
  appendExpenseItem,
  patchExpenses,
  patchFood,
  patchTransport,
  removeExpenseItem,
  updateExpenseItem,
} from './expenseEditorOperations.js';
import { ExpenseLineItemsGrid } from './ExpenseLineItemsGrid.jsx';
import { FixedExpenseCards } from './FixedExpenseCards.jsx';
import './ExpenseEditor.css';
import './ExpenseLineItemAlignment.css';

export function ExpenseEditor({ expenses, currency, locale, onChange }) {
  const { t } = useTranslation();

  const apply = (nextExpenses) => onChange(nextExpenses);
  const onPatch = (part) => apply(patchExpenses(expenses, part));
  const onSetTransport = (mode, amount) =>
    apply(patchTransport(expenses, mode, amount));
  const onAddItem = (key) => apply(appendExpenseItem(expenses, key));
  const onUpdateItem = (key, id, field, value) =>
    apply(updateExpenseItem(expenses, key, id, field, value));
  const onRemoveItem = (key, id) => apply(removeExpenseItem(expenses, key, id));
  const fixedFoodTotal = foodTotal(expenses.food);
  const currencySymbol = getCurrencySymbol(currency, locale);

  return (
    <div className="expenses expenses--journey">
      <FixedExpenseCards
        expenses={expenses}
        foodAmount={fixedFoodTotal}
        currencySymbol={currencySymbol}
        onSetLodging={(lodging) => onPatch({ lodging })}
        onSetTransport={onSetTransport}
        onSetFood={(value) =>
          apply(
            patchFood(expenses, {
              mode: 'single',
              single: value,
              breakfast: 0,
              lunch: 0,
              dinner: 0,
            })
          )
        }
      />

      <ExpenseLineItemsGrid
        items={expenses.transportOthers}
        getIcon={transportOtherIcon}
        typePlaceholder={t('otherTransportPlaceholder')}
        removeLabel={t('delete')}
        currencySymbol={currencySymbol}
        onUpdate={(id, field, value) =>
          onUpdateItem('transportOthers', id, field, value)
        }
        onRemove={(id) => onRemoveItem('transportOthers', id)}
      />

      <ExpenseLineItemsGrid
        items={expenses.others}
        getIcon={() => EXPENSE_ICONS.other}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('otherExpenses')}
        removeLabel={t('delete')}
        currencySymbol={currencySymbol}
        onAdd={() => onAddItem('others')}
        onUpdate={(id, field, value) => onUpdateItem('others', id, field, value)}
        onRemove={(id) => onRemoveItem('others', id)}
      />
    </div>
  );
}