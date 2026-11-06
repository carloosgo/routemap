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
    attractions: [],     // legado v4; la UI nueva migra su contenido a others
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

function normalizeLineItems(items) {
  return Array.isArray(items)
    ? items.map((item) => createLineItem(item?.label, item?.amount))
    : [];
}

// Migración defensiva: completa campos faltantes en datos viejos cargados,
// fusiona taxi+uber→taxiUber y conserva categorías retiradas de UI dentro de
// `others`. El contrato persistido mantiene `attractions` por compatibilidad,
// pero una vez normalizado queda vacío para que ningún monto quede oculto.
export function normalizeExpenses(raw) {
  const base = createExpenses();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const oldT = raw.transport && typeof raw.transport === 'object' ? raw.transport : {};

  const taxiUber =
    toAmount(oldT.taxiUber) + toAmount(oldT.taxi) + toAmount(oldT.uber);

  const fixedTransport = {
    plane: toAmount(oldT.plane),
    train: toAmount(oldT.train),
    bus: toAmount(oldT.bus),
    taxiUber,
  };

  const transportOthers = normalizeLineItems(raw.transportOthers);
  if (toAmount(oldT.ferry) > 0) {
    transportOthers.push(createLineItem('Ferry', oldT.ferry));
  }
  if (toAmount(oldT.boat) > 0) {
    transportOthers.push(createLineItem('Barco', oldT.boat));
  }

  const legacyAttractions = normalizeLineItems(raw.attractions).map((item) => ({
    ...item,
    label: item.label || 'Atracción',
  }));
  const others = [
    ...normalizeLineItems(raw.others),
    ...legacyAttractions,
  ];

  return {
    lodging: toAmount(raw.lodging),
    food: normalizeFood(raw.food, base.food),
    transport: fixedTransport,
    transportOthers,
    attractions: [],
    others,
  };
}

function expenseSets(source) {
  if (Array.isArray(source)) {
    return source.map((segment) => segment?.expenses).filter(Boolean);
  }
  const trip = source && typeof source === 'object' ? source : {};
  const sets = [];
  if (trip.originDetails?.expenses) sets.push(trip.originDetails.expenses);
  (Array.isArray(trip.segments) ? trip.segments : []).forEach((segment) => {
    if (segment?.expenses) sets.push(segment.expenses);
  });
  return sets;
}

// Agrega gastos por categoría. Acepta el viaje completo para incluir el origen
// y conserva compatibilidad con llamadas antiguas que pasan solo `segments`.
export function tripBreakdown(source) {
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

  expenseSets(source).forEach((expenses) => {
    acc.plane += toAmount(expenses.transport?.plane);
    acc.train += toAmount(expenses.transport?.train);
    acc.bus += toAmount(expenses.transport?.bus);
    acc.taxiUber += toAmount(expenses.transport?.taxiUber);
    acc.lodging += toAmount(expenses.lodging);
    acc.food += foodTotal(expenses.food);
    acc.attractions += lineItemsTotal(expenses.attractions);
    acc.others += lineItemsTotal(expenses.transportOthers) + lineItemsTotal(expenses.others);
  });

  return acc;
}
