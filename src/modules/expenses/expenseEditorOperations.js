import { sanitizeText, toAmount } from '../../shared/utils.js';
import { createLineItem } from './expenseModel.js';

export function patchExpenses(expenses, part) {
  return { ...expenses, ...part };
}

export function patchFood(expenses, part) {
  return patchExpenses(expenses, {
    food: { ...expenses.food, ...part },
  });
}

export function patchTransport(expenses, mode, amount) {
  return patchExpenses(expenses, {
    transport: { ...expenses.transport, [mode]: amount },
  });
}

export function appendExpenseItem(expenses, key) {
  const current = Array.isArray(expenses[key]) ? expenses[key] : [];
  return patchExpenses(expenses, {
    [key]: [...current, createLineItem('', 0)],
  });
}

export function updateExpenseItem(expenses, key, id, field, value) {
  const current = Array.isArray(expenses[key]) ? expenses[key] : [];
  return patchExpenses(expenses, {
    [key]: current.map((item) =>
      item.id === id
        ? {
            ...item,
            [field]: field === 'label' ? sanitizeText(value) : value,
          }
        : item
    ),
  });
}

export function removeExpenseItem(expenses, key, id) {
  const current = Array.isArray(expenses[key]) ? expenses[key] : [];
  return patchExpenses(expenses, {
    [key]: current.filter((item) => item.id !== id),
  });
}

// Permite presentar una categoría de line-items como un único monto sin
// cambiar el contrato persistido de Storage v4. Se conserva la identidad y
// las etiquetas existentes; la diferencia se aplica desde el último ítem.
export function setExpenseItemsTotal(expenses, key, amount) {
  const target = toAmount(amount);
  const current = Array.isArray(expenses[key]) ? expenses[key] : [];

  if (current.length === 0) {
    return patchExpenses(expenses, {
      [key]: target > 0 ? [createLineItem('', target)] : [],
    });
  }

  const next = current.map((item) => ({
    ...item,
    amount: toAmount(item?.amount),
  }));
  const currentTotal = next.reduce((sum, item) => sum + item.amount, 0);
  const difference = target - currentTotal;

  if (difference > 0) {
    const lastIndex = next.length - 1;
    next[lastIndex] = {
      ...next[lastIndex],
      amount: next[lastIndex].amount + difference,
    };
  } else if (difference < 0) {
    let pendingReduction = Math.abs(difference);
    for (let index = next.length - 1; index >= 0 && pendingReduction > 0; index -= 1) {
      const reduction = Math.min(next[index].amount, pendingReduction);
      next[index] = {
        ...next[index],
        amount: next[index].amount - reduction,
      };
      pendingReduction -= reduction;
    }
  }

  return patchExpenses(expenses, {
    [key]: next.filter((item) => item.label || item.amount > 0),
  });
}

export function usesDetailedFood(expenses) {
  return expenses?.food?.mode === 'detailed';
}
