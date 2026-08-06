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
  detailedFood,
  t,
  onPatch,
  onSetFood,
  onSetTransport,
}) {
  return (
    <div className="expenses__grid">
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.plane}
        label={t('plane')}
        value={expenses.transport.plane}
        onChange={(value) => onSetTransport('plane', value)}
      />
      <ExpenseMoneyCard
        definition={EXPENSE_ICONS.lodging}
        label={t('lodging')}
        value={expenses.lodging}
        onChange={(value) => onPatch({ lodging: value })}
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
        label={t('taxiUber')}
        value={expenses.transport.taxiUber}
        onChange={(value) => onSetTransport('taxiUber', value)}
      />

      {!detailedFood && (
        <ExpenseMoneyCard
          definition={EXPENSE_ICONS.food}
          label={t('food')}
          value={expenses.food.single}
          onChange={(value) => onSetFood({ single: value })}
        />
      )}

      {detailedFood && (
        <>
          <ExpenseMoneyCard
            definition={EXPENSE_ICONS.breakfast}
            label={t('breakfast')}
            value={expenses.food.breakfast}
            onChange={(value) => onSetFood({ breakfast: value })}
          />
          <ExpenseMoneyCard
            definition={EXPENSE_ICONS.lunch}
            label={t('lunch')}
            value={expenses.food.lunch}
            onChange={(value) => onSetFood({ lunch: value })}
          />
          <ExpenseMoneyCard
            definition={EXPENSE_ICONS.dinner}
            label={t('dinner')}
            value={expenses.food.dinner}
            onChange={(value) => onSetFood({ dinner: value })}
          />
        </>
      )}
    </div>
  );
}
