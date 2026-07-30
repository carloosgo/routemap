import { toAmount, uid, sanitizeText } from '../../shared/utils.js';

// Modos de transporte fijos (4 conceptos unificados).
export const TRANSPORT_MODES = ['plane', 'train', 'bus', 'taxiUber'];

// Estructura inicial de gastos de un tramo.
export function createExpenses() {
  return {
    lodging: 0,
    food: {
      mode: 'single', // 'single' | 'detailed'
      single: 0,
      breakfast: 0,
      lunch: 0,
      dinner: 0,
    },
    transport: TRANSPORT_MODES.reduce((acc, mode) => {
      acc[mode] = 0;
      return acc;
    }, {}),
    transportOthers: [], // tipo libre: [{ id, label, amount }]
    attractions: [],     // [{ id, label, amount }]
    others: [],          // [{ id, label, amount }]
  };
}

// Crea un ítem de monto con etiqueta definida por el usuario.
export function createLineItem(label = '', amount = 0) {
  return { id: uid(), label: sanitizeText(label), amount: toAmount(amount) };
}

// --- Cálculo de totales ---

export function foodTotal(food) {
  if (!food) return 0;
  if (food.mode === 'detailed') {
    return toAmount(food.breakfast) + toAmount(food.lunch) + toAmount(food.dinner);
  }
  return toAmount(food.single);
}

export function transportTotal(transport, transportOthers) {
  const fixed = !transport
    ? 0
    : TRANSPORT_MODES.reduce((sum, mode) => sum + toAmount(transport[mode]), 0);
  return fixed + lineItemsTotal(transportOthers);
}

export function lineItemsTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + toAmount(item?.amount), 0);
}

// Total completo de gastos de un tramo.
export function expensesTotal(expenses) {
  if (!expenses) return 0;
  return (
    toAmount(expenses.lodging) +
    foodTotal(expenses.food) +
    transportTotal(expenses.transport, expenses.transportOthers) +
    lineItemsTotal(expenses.attractions) +
    lineItemsTotal(expenses.others)
  );
}

function normalizeFood(rawFood, baseFood) {
  const source = rawFood && typeof rawFood === 'object' ? rawFood : {};
  return {
    mode: source.mode === 'detailed' ? 'detailed' : 'single',
    single: toAmount(source.single ?? baseFood.single),
    breakfast: toAmount(source.breakfast ?? baseFood.breakfast),
    lunch: toAmount(source.lunch ?? baseFood.lunch),
    dinner: toAmount(source.dinner ?? baseFood.dinner),
  };
}

// Migración defensiva: completa campos faltantes en datos viejos cargados
// desde almacenamiento y fusiona taxi+uber→taxiUber, convierte ferry/boat
// a ítems libres de transportOthers para no perder datos.
export function normalizeExpenses(raw) {
  const base = createExpenses();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const oldT = raw.transport && typeof raw.transport === 'object' ? raw.transport : {};

  // Fusionar taxi + uber (campos anteriores) con taxiUber si ya existía.
  const taxiUber =
    toAmount(oldT.taxiUber) + toAmount(oldT.taxi) + toAmount(oldT.uber);

  const fixedTransport = {
    plane: toAmount(oldT.plane),
    train: toAmount(oldT.train),
    bus: toAmount(oldT.bus),
    taxiUber,
  };

  // Ítems libres de transporte existentes.
  const transportOthers = Array.isArray(raw.transportOthers)
    ? raw.transportOthers.map((item) => createLineItem(item?.label, item?.amount))
    : [];

  // Migrar ferry y boat a transportOthers si tenían monto.
  if (toAmount(oldT.ferry) > 0) {
    transportOthers.push(createLineItem('Ferry', oldT.ferry));
  }
  if (toAmount(oldT.boat) > 0) {
    transportOthers.push(createLineItem('Barco', oldT.boat));
  }

  return {
    lodging: toAmount(raw.lodging),
    food: normalizeFood(raw.food, base.food),
    transport: fixedTransport,
    transportOthers,
    attractions: Array.isArray(raw.attractions)
      ? raw.attractions.map((item) => createLineItem(item?.label, item?.amount))
      : [],
    others: Array.isArray(raw.others)
      ? raw.others.map((item) => createLineItem(item?.label, item?.amount))
      : [],
  };
}

// Agrega los gastos de todos los tramos por categoría, para el desglose del total.
// Devuelve un objeto con el monto sumado de cada categoría a través de todos los tramos.
export function tripBreakdown(segments) {
  const acc = {
    plane: 0,
    train: 0,
    bus: 0,
    taxiUber: 0,
    lodging: 0,
    food: 0,
    attractions: 0,
    others: 0,
  };

  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    const expenses = segment?.expenses;
    if (!expenses) return;
    acc.plane += toAmount(expenses.transport?.plane);
    acc.train += toAmount(expenses.transport?.train);
    acc.bus += toAmount(expenses.transport?.bus);
    acc.taxiUber += toAmount(expenses.transport?.taxiUber);
    acc.lodging += toAmount(expenses.lodging);
    acc.food += foodTotal(expenses.food);
    acc.attractions += lineItemsTotal(expenses.attractions);
    // "Otros" agrupa gastos libres de transporte + otros generales.
    acc.others += lineItemsTotal(expenses.transportOthers) + lineItemsTotal(expenses.others);
  });

  return acc;
}
