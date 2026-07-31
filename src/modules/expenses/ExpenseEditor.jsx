import { IconPlane, IconTrain, IconBus, IconCar, IconBuildingSkyscraper, IconToolsKitchen2, IconBread, IconSoup, IconMoon, IconCompass, IconShip, IconTicket, IconCreditCard, IconX } from '@tabler/icons-react';
import { MoneyCard } from '../../components/MoneyInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { formatMoney, sanitizeText } from '../../shared/utils.js';
import { createLineItem, expensesTotal } from './expenseModel.js';

const ICON_SIZE = 15;
const TRANSPORT_ICONS = {
  plane: { icon: <IconPlane size={ICON_SIZE} />, bg: '#eef0fd', color: '#4f6df5' },
  train: { icon: <IconTrain size={ICON_SIZE} />, bg: '#fff8e6', color: '#d4a017' },
  bus: { icon: <IconBus size={ICON_SIZE} />, bg: '#e6f7ef', color: '#2aa866' },
  taxiUber: { icon: <IconCar size={ICON_SIZE} />, bg: '#fce8e8', color: '#d94f4f' },
};
const FOOD_ICONS = {
  single: { icon: <IconToolsKitchen2 size={ICON_SIZE} />, bg: '#fce8e8', color: '#d94f4f' },
  breakfast: { icon: <IconBread size={ICON_SIZE} />, bg: '#fff8e6', color: '#d4a017' },
  lunch: { icon: <IconSoup size={ICON_SIZE} />, bg: '#fce8e8', color: '#d94f4f' },
  dinner: { icon: <IconMoon size={ICON_SIZE} />, bg: '#eef0fd', color: '#4f6df5' },
};
const LODGING_ICON = { icon: <IconBuildingSkyscraper size={ICON_SIZE} />, bg: '#fff8e6', color: '#d4a017' };
const OTHER_TRANSPORT = { icon: <IconCompass size={ICON_SIZE} />, bg: '#e6f7ef', color: '#2aa866' };
const BOAT_ICON_DEF = { icon: <IconShip size={ICON_SIZE} />, bg: '#e6f7ef', color: '#2aa866' };
const ATTRACTION_ICON = { icon: <IconTicket size={ICON_SIZE} />, bg: '#eef0fd', color: '#4f6df5' };
const OTHER_ICON = { icon: <IconCreditCard size={ICON_SIZE} />, bg: '#f5f5f5', color: '#888' };
const BOAT_KEYWORDS = ['ferri', 'ferry', 'barco', 'crucero', 'lancha', 'boat', 'ship'];

function getOtherTransportIcon(label) {
  const normalized = (label || '').toLowerCase();
  return BOAT_KEYWORDS.some((keyword) => normalized.includes(keyword)) ? BOAT_ICON_DEF : OTHER_TRANSPORT;
}

export function ExpenseEditor({ expenses, currency, locale, onChange }) {
  const { t } = useTranslation();
  const patch = (part) => onChange({ ...expenses, ...part });
  const setFood = (part) => patch({ food: { ...expenses.food, ...part } });
  const setTransport = (mode, amount) => patch({ transport: { ...expenses.transport, [mode]: amount } });
  const addItem = (key) => patch({ [key]: [...(Array.isArray(expenses[key]) ? expenses[key] : []), createLineItem('', 0)] });
  const updateItem = (key, id, field, value) => {
    const current = Array.isArray(expenses[key]) ? expenses[key] : [];
    patch({ [key]: current.map((item) => item.id === id ? { ...item, [field]: field === 'label' ? sanitizeText(value) : value } : item) });
  };
  const removeItem = (key, id) => {
    const current = Array.isArray(expenses[key]) ? expenses[key] : [];
    patch({ [key]: current.filter((item) => item.id !== id) });
  };
  const isDetailed = expenses.food.mode === 'detailed';

  return (
    <div className="expenses">
      <div className="expenses__toggle">
        <span className="expenses__togglelabel">{t('food')}:</span>
        <div className="toggle">
          <button type="button" className={'toggle__btn' + (!isDetailed ? ' is-active' : '')} onClick={() => setFood({ mode: 'single' })}>{t('foodSingle')}</button>
          <button type="button" className={'toggle__btn' + (isDetailed ? ' is-active' : '')} onClick={() => setFood({ mode: 'detailed' })}>{t('foodDetailed')}</button>
        </div>
      </div>

      <div className="expenses__grid">
        <MoneyCard icon={TRANSPORT_ICONS.plane.icon} iconBg={TRANSPORT_ICONS.plane.bg} iconColor={TRANSPORT_ICONS.plane.color} label={t('plane')} value={expenses.transport.plane} onChange={(value) => setTransport('plane', value)} />
        <MoneyCard icon={LODGING_ICON.icon} iconBg={LODGING_ICON.bg} iconColor={LODGING_ICON.color} label={t('lodging')} value={expenses.lodging} onChange={(value) => patch({ lodging: value })} />
        <MoneyCard icon={TRANSPORT_ICONS.train.icon} iconBg={TRANSPORT_ICONS.train.bg} iconColor={TRANSPORT_ICONS.train.color} label={t('train')} value={expenses.transport.train} onChange={(value) => setTransport('train', value)} />
        <MoneyCard icon={TRANSPORT_ICONS.bus.icon} iconBg={TRANSPORT_ICONS.bus.bg} iconColor={TRANSPORT_ICONS.bus.color} label={t('bus')} value={expenses.transport.bus} onChange={(value) => setTransport('bus', value)} />
        <MoneyCard icon={TRANSPORT_ICONS.taxiUber.icon} iconBg={TRANSPORT_ICONS.taxiUber.bg} iconColor={TRANSPORT_ICONS.taxiUber.color} label={t('taxiUber')} value={expenses.transport.taxiUber} onChange={(value) => setTransport('taxiUber', value)} />
        {!isDetailed && <MoneyCard icon={FOOD_ICONS.single.icon} iconBg={FOOD_ICONS.single.bg} iconColor={FOOD_ICONS.single.color} label={t('food')} value={expenses.food.single} onChange={(value) => setFood({ single: value })} />}
        {isDetailed && <>
          <MoneyCard icon={FOOD_ICONS.breakfast.icon} iconBg={FOOD_ICONS.breakfast.bg} iconColor={FOOD_ICONS.breakfast.color} label={t('breakfast')} value={expenses.food.breakfast} onChange={(value) => setFood({ breakfast: value })} />
          <MoneyCard icon={FOOD_ICONS.lunch.icon} iconBg={FOOD_ICONS.lunch.bg} iconColor={FOOD_ICONS.lunch.color} label={t('lunch')} value={expenses.food.lunch} onChange={(value) => setFood({ lunch: value })} />
          <MoneyCard icon={FOOD_ICONS.dinner.icon} iconBg={FOOD_ICONS.dinner.bg} iconColor={FOOD_ICONS.dinner.color} label={t('dinner')} value={expenses.food.dinner} onChange={(value) => setFood({ dinner: value })} />
        </>}
      </div>

      <LineItemsGrid title={t('otherTransport')} items={expenses.transportOthers} getIcon={(item) => getOtherTransportIcon(item.label)} typePlaceholder={t('itemTypePlaceholder')} addLabel={t('addItem')} onAdd={() => addItem('transportOthers')} onUpdate={(id, field, value) => updateItem('transportOthers', id, field, value)} onRemove={(id) => removeItem('transportOthers', id)} />
      <LineItemsGrid title={t('attractions')} items={expenses.attractions} getIcon={() => ATTRACTION_ICON} typePlaceholder={t('itemTypePlaceholder')} addLabel={t('addItem')} onAdd={() => addItem('attractions')} onUpdate={(id, field, value) => updateItem('attractions', id, field, value)} onRemove={(id) => removeItem('attractions', id)} />
      <LineItemsGrid title={t('otherExpenses')} items={expenses.others} getIcon={() => OTHER_ICON} typePlaceholder={t('itemTypePlaceholder')} addLabel={t('addItem')} onAdd={() => addItem('others')} onUpdate={(id, field, value) => updateItem('others', id, field, value)} onRemove={(id) => removeItem('others', id)} />

      <div className="expenses__total"><span>{t('segmentTotal')}</span><strong>{formatMoney(expensesTotal(expenses), currency, locale)}</strong></div>
    </div>
  );
}

function LineItemsGrid({ title, items, getIcon, typePlaceholder, addLabel, onAdd, onUpdate, onRemove }) {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <section className="lineitems-section">
      <div className="expenses__head"><h4 className="expenses__title">{title}</h4><button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}>+ {addLabel}</button></div>
      {safeItems.length > 0 && <div className="expenses__grid">
        {safeItems.map((item) => {
          const { icon, bg, color } = getIcon(item);
          return <div className="moneycard moneycard--lineitem" key={item.id}>
            <span className="moneycard__icon" style={{ '--icon-bg': bg, '--icon-color': color }} aria-hidden="true">{icon}</span>
            <input type="text" className="moneycard__typeinput" placeholder={typePlaceholder} value={item.label} onChange={(event) => onUpdate(item.id, 'label', event.target.value)} />
            <span className="moneycard__amount"><span className="moneycard__currency">$</span><input type="number" className="moneycard__input" min="0" step="0.01" inputMode="decimal" value={item.amount === 0 ? '' : item.amount} placeholder="0.00" onChange={(event) => onUpdate(item.id, 'amount', Number(event.target.value) || 0)} onFocus={(event) => event.target.select()} /><button type="button" className="moneycard__remove" aria-label="remove" onClick={() => onRemove(item.id)}><IconX size={14} aria-hidden="true" /></button></span>
          </div>;
        })}
      </div>}
    </section>
  );
}
