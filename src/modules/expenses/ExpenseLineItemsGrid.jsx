import { IconX } from '@tabler/icons-react';

export function ExpenseLineItemsGrid({
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
                  onChange={(event) => onUpdate(item.id, 'label', event.target.value)}
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
                    onChange={(event) =>
                      onUpdate(item.id, 'amount', Number(event.target.value) || 0)
                    }
                    onFocus={(event) => event.target.select()}
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
