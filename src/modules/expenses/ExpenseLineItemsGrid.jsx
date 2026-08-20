import { IconPlus, IconX } from '@tabler/icons-react';

export function ExpenseLineItemsGrid({
  title,
  items,
  getIcon,
  typePlaceholder,
  addLabel,
  removeLabel,
  onAdd,
  onUpdate,
  onRemove,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const hasContent = Boolean(title || safeItems.length || onAdd);

  if (!hasContent) return null;

  return (
    <section className="lineitems-section">
      {title && <h4 className="expenses__title">{title}</h4>}

      {safeItems.length > 0 && (
        <div className="expenses__lineitems">
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
                    aria-label={removeLabel}
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

      {onAdd && (
        <button type="button" className="expenses__add-other" onClick={onAdd}>
          <span className="expenses__add-other-icon" aria-hidden="true">
            <IconPlus size={15} />
          </span>
          <span>{addLabel}</span>
        </button>
      )}
    </section>
  );
}
