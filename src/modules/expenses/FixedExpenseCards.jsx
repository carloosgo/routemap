import { useTranslation } from '../../i18n/index.jsx';
import { MoneyCard } from '../../components/MoneyInput.jsx';
import { EXPENSE_ICONS } from './expenseEditorCatalog.jsx';

function ExpenseMoneyCard({ definition, label, value, onChange }) {
  return (
    <MoneyCard
      icon={definition.icon}
      iconBg={definition.bg}
      iconColor={definition.color}
      label={label}
      value={value}
      onChange={onChange}
    />
  );
}

export function FixedExpenseCards({
  expenses,
  foodAmount,
  onSetLodging,
  onSetTransport,
  onSetFood,
}) {
  const { t } = useTranslation();

  return (
    <div className="expenses__fixed-list">
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.lodging}
        label={t('lodging')}
        value={expenses.lodging}
        onChange={onSetLodging}
      />
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.plane}
        label={t('flights')}
        value={expenses.transport.plane}
        onChange={(value) => onSetTransport('plane', value)}
      />
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.train}
        label={t('train')}
        value={expenses.transport.train}
        onChange={(value) => onSetTransport('train', value)}
      />
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.bus}
        label={t('bus')}
        value={expenses.transport.bus}
        onChange={(value) => onSetTransport('bus', value)}
      />
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.taxiUber}
        label={t('taxi')}
        value={expenses.transport.taxiUber}
        onChange={(value) => onSetTransport('taxiUber', value)}
      />
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.food}
        label={t('food')}
        value={foodAmount}
        onChange={onSetFood}
      />
    </div>
  );
}
