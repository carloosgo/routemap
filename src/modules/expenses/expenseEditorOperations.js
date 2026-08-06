import { sanitizeText } from '../../shared/utils.js';
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

export function usesDetailedFood(expenses) {
  return expenses?.food?.mode === 'detailed';
}
