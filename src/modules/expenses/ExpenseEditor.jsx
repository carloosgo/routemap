import { MoneyCard } from '../../components/MoneyInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { formatMoney } from '../../shared/utils.js';
import {
  expensesTotal,
  foodTotal,
  lineItemsTotal,
} from './expenseModel.js';
import { EXPENSE_ICONS, transportOtherIcon } from './expenseEditorCatalog.jsx';
import {
  appendExpenseItem,
  patchExpenses,
  patchFood,
  patchTransport,
  removeExpenseItem,
  setExpenseItemsTotal,
  updateExpenseItem,
} from './expenseEditorOperations.js';
import { ExpenseLineItemsGrid } from './ExpenseLineItemsGrid.jsx';
import { FixedExpenseCards } from './FixedExpenseCards.jsx';
import './ExpenseEditor.css';

function CategoryMoneyCard({ definition, label, value, onChange, className = '' }) {
  return (
    <div className={className}>
      <MoneyCard
        icon={definition.icon}
        iconBg={definition.bg}
        iconColor={definition.color}
        label={label}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

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

  const legacyFoodTotal = foodTotal(expenses.food);
  const attractionsTotal = lineItemsTotal(expenses.attractions);

  return (
    <div className="expenses expenses--journey">
      <FixedExpenseCards
        expenses={expenses}
        t={t}
        onPatch={onPatch}
        onSetTransport={onSetTransport}
      />

      {legacyFoodTotal > 0 && (
        <CategoryMoneyCard
          className="expenses__legacy-food"
          definition={EXPENSE_ICONS.food}
          label={t('food')}
          value={legacyFoodTotal}
          onChange={(value) =>
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
      )}

      <CategoryMoneyCard
        definition={EXPENSE_ICONS.attraction}
        label={t('attractions')}
        value={attractionsTotal}
        onChange={(value) => apply(setExpenseItemsTotal(expenses, 'attractions', value))}
      />

      <ExpenseLineItemsGrid
        items={expenses.transportOthers}
        getIcon={transportOtherIcon}
        typePlaceholder={t('otherTransportPlaceholder')}
        removeLabel={t('delete')}
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
