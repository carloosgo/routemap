import { useEffect, useRef, useState } from 'react';
import { toAmount } from '../shared/utils.js';
import {
  formatMoneyDraft,
  formatMoneyValue,
  parseMoneyDraft,
} from './moneyInputModel.js';

export function MoneyAmountInput({
  value,
  onChange,
  ariaLabel,
  className = 'moneycard__input',
  placeholder = '0.00',
}) {
  const focusedRef = useRef(false);
  const [draft, setDraft] = useState(() => formatMoneyValue(value));

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatMoneyValue(value));
  }, [value]);

  return (
    <input
      type="text"
      className={className}
      inputMode="decimal"
      pattern="[0-9,]*([.][0-9]{0,2})?"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextDraft = formatMoneyDraft(event.target.value);
        setDraft(nextDraft);
        onChange(parseMoneyDraft(nextDraft));
      }}
      onFocus={(event) => {
        focusedRef.current = true;
        event.target.select();
      }}
      onBlur={() => {
        focusedRef.current = false;
        setDraft(formatMoneyValue(value));
      }}
    />
  );
}

// Tarjeta de gasto individual: icono + etiqueta a la izquierda, monto
// editable a la derecha, en una sola fila horizontal (no apilado).
// Es la unidad visual repetida para cada concepto (Tren, Hospedaje, Bus,
// Avión, Desayuno, Museo, etc.) — todas con el mismo diseño exacto.
export function MoneyCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  onChange,
  ariaLabel,
  centered = false,
}) {
  const centeredRowStyle = centered
    ? {
        display: 'grid',
        gridTemplateColumns: '18px minmax(64px, 82px) minmax(60px, 70px)',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: '4px',
        width: 'min(178px, calc(100% - 12px))',
        maxWidth: '100%',
        justifySelf: 'center',
      }
    : undefined;

  return (
    <div className="moneycard" style={centeredRowStyle}>
      <span
        className="moneycard__icon"
        style={{
          '--icon-bg': iconBg,
          '--icon-color': iconColor,
          ...(centered ? { gridColumn: 1 } : {}),
        }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span
        className="moneycard__label"
        style={centered ? { gridColumn: 2, minWidth: 0 } : undefined}
      >
        {label}
      </span>
      <span
        className="moneycard__amount"
        style={centered
          ? {
              gridColumn: 3,
              width: '100%',
              minWidth: '60px',
              maxWidth: '70px',
              marginLeft: 0,
              paddingLeft: 0,
              paddingRight: 0,
            }
          : undefined}
      >
        <span className="moneycard__currency">$</span>
        <MoneyAmountInput
          value={value}
          onChange={onChange}
          ariaLabel={ariaLabel || label}
        />
      </span>
    </div>
  );
}

// Mantiene compatibilidad con el nombre anterior usado en otras partes.
export function MoneyInput({ value, onChange, label, ariaLabel }) {
  return (
    <label className="money">
      {label && <span className="money__label">{label}</span>}
      <input
        type="number"
        className="input input--money"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value === 0 ? '' : value}
        placeholder="0"
        aria-label={ariaLabel || label}
        onChange={(e) => onChange(toAmount(e.target.value))}
        onFocus={(e) => e.target.select()}
      />
    </label>
  );
}
