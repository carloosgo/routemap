function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function lineItemsTotal(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + amount(item?.amount),
    0
  );
}

export function v4SegmentAggregateValue(segment) {
  const expenses = segment?.expenses || {};
  const food = expenses.food || {};
  const transport = expenses.transport || {};
  const foodTotal = food.mode === 'detailed'
    ? amount(food.breakfast) + amount(food.lunch) + amount(food.dinner)
    : amount(food.single);
  const transportTotal = ['plane', 'train', 'bus', 'taxiUber']
    .reduce((sum, mode) => sum + amount(transport[mode]), 0)
    + lineItemsTotal(expenses.transportOthers);

  return amount(expenses.lodging)
    + foodTotal
    + transportTotal
    + lineItemsTotal(expenses.attractions)
    + lineItemsTotal(expenses.others);
}
