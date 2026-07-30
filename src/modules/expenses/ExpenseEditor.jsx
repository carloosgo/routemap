import {
  IconPlane,
  IconTrain,
  IconBus,
  IconCar,
  IconBuildingSkyscraper,
  IconToolsKitchen2,
  IconBread,
  IconSoup,
  IconMoon,
  IconCompass,
  IconShip,
  IconTicket,
  IconCreditCard,
  IconX,
} from '@tabler/icons-react';
import { MoneyCard } from '../../components/MoneyInput.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { formatMoney, sanitizeText } from '../../shared/utils.js';
import { createLineItem, expensesTotal } from './expenseModel.js';

const ICON_SIZE = 15;

// Cada concepto tiene su propio círculo pastel + icono saturado del mismo tono.
// bg: color de fondo del círculo. color: color del icono dentro del círculo.
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

const LODGING_ICON = {
  icon: <IconBuildingSkyscraper size={ICON_SIZE} />,
  bg: '#fff8e6',
  color: '#d4a017',
};
const OTHER_TRANSPORT = {
  icon: <IconCompass size={ICON_SIZE} />,
  bg: '#e6f7ef',
  color: '#2aa866',
};
const BOAT_ICON_DEF = { icon: <IconShip size={ICON_SIZE} />, bg: '#e6f7ef', color: '#2aa866' };
const ATTRACTION_ICON = {
  icon: <IconTicket size={ICON_SIZE} />,
  bg: '#eef0fd',
  color: '#4f6df5',
};
const OTHER_ICON = { icon: <IconCreditCard size={ICON_SIZE} />, bg: '#f5f5f5', color: '#888' };

const BOAT_KEYWORDS = ['ferri', 'ferry', 'barco', 'crucero', 'lancha', 'boat', 'ship'];

function getOtherTransportIcon(label) {
  const normalized = (label || '').toLowerCase();
  if (BOAT_KEYWORDS.some((kw) => normalized.includes(kw))) return BOAT_ICON_DEF;
  return OTHER_TRANSPORT;
}

export function ExpenseEditor({ expenses, currency, locale, onChange }) {
  const { t } = useTranslation();

  function patch(part) {
    onChange({ ...expenses, ...part });
  }
  function setFood(part) {
    patch({ food: { ...expenses.food, ...part } });
  }
  function setTransport(mode, amount) {
    patch({ transport: { ...expenses.transport, [mode]: amount } });
  }
  function addItem(key) {
    const current = Array.isArray(expenses[key]) ? expenses[key] : [];
    patch({ [key]: [...current, createLineItem('', 0)] });
  }
  function updateItem(key, id, field, val) {
    const current = Array.isArray(expenses[key]) ? expenses[key] : [];
    patch({
      [key]: current.map((it) =>
        it.id === id ? { ...it, [field]: field === 'label' ? sanitizeText(val) : val } : it
      ),
    });
  }
  function removeItem(key, id) {
    const current = Array.isArray(expenses[key]) ? expenses[key] : [];
    patch({ [key]: current.filter((it) => it.id !== id) });
  }

  const isDetailed = expenses.food.mode === 'detailed';

  return (
    <div className="expenses">
      {/* Selector de modo de alimentos */}
      <div className="expenses__toggle">
        <span className="expenses__togglelabel">{t('food')}:</span>
        <div className="toggle">
          <button
            type="button"
            className={'toggle__btn' + (!isDetailed ? ' is-active' : '')}
            onClick={() => setFood({ mode: 'single' })}
          >
            {t('foodSingle')}
          </button>
          <button
            type="button"
            className={'toggle__btn' + (isDetailed ? ' is-active' : '')}
            onClick={() => setFood({ mode: 'detailed' })}
          >
            {t('foodDetailed')}
          </button>
        </div>
      </div>

      {/* Grilla de 2 columnas: todos los conceptos fijos */}
      <div className="expenses__grid">
        <MoneyCard
          icon={TRANSPORT_ICONS.plane.icon}
          iconBg={TRANSPORT_ICONS.plane.bg}
          iconColor={TRANSPORT_ICONS.plane.color}
          label={t('plane')}
          value={expenses.transport.plane}
          onChange={(v) => setTransport('plane', v)}
        />
        <MoneyCard
          icon={LODGING_ICON.icon}
          iconBg={LODGING_ICON.bg}
          iconColor={LODGING_ICON.color}
          label={t('lodging')}
          value={expenses.lodging}
          onChange={(v) => patch({ lodging: v })}
        />

        <MoneyCard
          icon={TRANSPORT_ICONS.train.icon}
          iconBg={TRANSPORT_ICONS.train.bg}
          iconColor={TRANSPORT_ICONS.train.color}
          label={t('train')}
          value={expenses.transport.train}
          onChange={(v) => setTransport('train', v)}
        />
        <MoneyCard
          icon={TRANSPORT_ICONS.bus.icon}
          iconBg={TRANSPORT_ICONS.bus.bg}
          iconColor={TRANSPORT_ICONS.bus.color}
          label={t('bus')}
          value={expenses.transport.bus}
          onChange={(v) => setTransport('bus', v)}
        />

        <MoneyCard
          icon={TRANSPORT_ICONS.taxiUber.icon}
          iconBg={TRANSPORT_ICONS.taxiUber.bg}
          iconColor={TRANSPORT_ICONS.taxiUber.color}
          label={t('taxiUber')}
          value={expenses.transport.taxiUber}
          onChange={(v) => setTransport('taxiUber', v)}
        />

        {!isDetailed && (
          <MoneyCard
            icon={FOOD_ICONS.single.icon}
            iconBg={FOOD_ICONS.single.bg}
            iconColor={FOOD_ICONS.single.color}
            label={t('food')}
            value={expenses.food.single}
            onChange={(v) => setFood({ single: v })}
          />
        )}

        {isDetailed && (
          <>
            <MoneyCard
              icon={FOOD_ICONS.breakfast.icon}
              iconBg={FOOD_ICONS.breakfast.bg}
              iconColor={FOOD_ICONS.breakfast.color}
              label={t('breakfast')}
              value={expenses.food.breakfast}
              onChange={(v) => setFood({ breakfast: v })}
            />
            <MoneyCard
              icon={FOOD_ICONS.lunch.icon}
              iconBg={FOOD_ICONS.lunch.bg}
              iconColor={FOOD_ICONS.lunch.color}
              label={t('lunch')}
              value={expenses.food.lunch}
              onChange={(v) => setFood({ lunch: v })}
            />
            <MoneyCard
              icon={FOOD_ICONS.dinner.icon}
              iconBg={FOOD_ICONS.dinner.bg}
              iconColor={FOOD_ICONS.dinner.color}
              label={t('dinner')}
              value={expenses.food.dinner}
              onChange={(v) => setFood({ dinner: v })}
            />
          </>
        )}
      </div>

      {/* Otro transporte */}
      <LineItemsGrid
        title={t('otherTransport')}
        items={expenses.transportOthers}
        getIcon={(item) => getOtherTransportIcon(item.label)}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('addItem')}
        onAdd={() => addItem('transportOthers')}
        onUpdate={(id, field, val) => updateItem('transportOthers', id, field, val)}
        onRemove={(id) => removeItem('transportOthers', id)}
      />

      {/* Atracciones */}
      <LineItemsGrid
        title={t('attractions')}
        items={expenses.attractions}
        getIcon={() => ATTRACTION_ICON}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('addItem')}
        onAdd={() => addItem('attractions')}
        onUpdate={(id, field, val) => updateItem('attractions', id, field, val)}
        onRemove={(id) => removeItem('attractions', id)}
      />

      {/* Otros gastos */}
      <LineItemsGrid
        title={t('otherExpenses')}
        items={expenses.others}
        getIcon={() => OTHER_ICON}
        typePlaceholder={t('itemTypePlaceholder')}
        addLabel={t('addItem')}
        onAdd={() => addItem('others')}
        onUpdate={(id, field, val) => updateItem('others', id, field, val)}
        onRemove={(id) => removeItem('others', id)}
      />

      <div className="expenses__total">
        <span>{t('segmentTotal')}</span>
        <strong>{formatMoney(expensesTotal(expenses), currency, locale)}</strong>
      </div>
    </div>
  );
}

// Grilla de ítems con tipo definido por el usuario.
// getIcon(item) ahora devuelve { icon, bg, color } en vez de solo el elemento JSX.
function LineItemsGrid({
  title,
  items,
  getIcon,
  typePlaceholder,
  addLabel,
  onAdd,
  onUpdate,
  onRemove,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <section className="lineitems-section">
      <div className="expenses__head">
        <h4 className="expenses__title">{title}</h4>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}>
          + {addLabel}
        </button>
      </div>
      {safeItems.length > 0 && (
        <div className="expenses__grid">
          {safeItems.map((item) => {
            const { icon, bg, color } = getIcon(item);
            return (
              <div className="moneycard moneycard--lineitem" key={item.id}>
                <span
                  className="moneycard__icon"
                  style={{ '--icon-bg': bg, '--icon-color': color }}
                  aria-hidden="true"
                >
                  {icon}
                </span>
                <input
                  type="text"
                  className="moneycard__typeinput"
                  placeholder={typePlaceholder}
                  value={item.label}
                  onChange={(e) => onUpdate(item.id, 'label', e.target.value)}
                />
                <span className="moneycard__amount">
                  <span className="moneycard__currency">$</span>
                  <input
                    type="number"
                    className="moneycard__input"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={item.amount === 0 ? '' : item.amount}
                    placeholder="0.00"
                    onChange={(e) => onUpdate(item.id, 'amount', Number(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="moneycard__remove"
                    aria-label="remove"
                    onClick={() => onRemove(item.id)}
                  >
                    <IconX size={14} aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
