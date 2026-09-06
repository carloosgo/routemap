import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDate,
  formatMoney,
  getCurrencySymbol,
  sanitizeText,
  toAmount,
  uid,
} from '../src/shared/utils.js';

test('toAmount acepta números válidos y neutraliza valores negativos o inválidos', () => {
  assert.equal(toAmount(12.5), 12.5);
  assert.equal(toAmount('19.99'), 19.99);
  assert.equal(toAmount(-1), 0);
  assert.equal(toAmount('no-es-numero'), 0);
  assert.equal(toAmount(undefined), 0);
});

test('formatMoney aplica moneda y locale sin propagar importes inválidos', () => {
  const amount = 1234.5;
  const options = {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  };
  const esMoney = formatMoney(amount, 'MXN', 'es-MX');
  const enMoney = formatMoney(amount, 'MXN', 'en-US');

  assert.equal(esMoney, new Intl.NumberFormat('es-MX', options).format(amount));
  assert.equal(enMoney, new Intl.NumberFormat('en-US', options).format(amount));
  assert.notEqual(esMoney, enMoney);

  const invalidAmount = formatMoney('invalido', 'USD', 'en-US');
  assert.match(invalidAmount, /0/);
});

test('formatMoney usa una salida segura cuando la moneda no es válida', () => {
  assert.equal(formatMoney(10, 'MONEDA_INVALIDA', 'es-MX'), '10.00 MONEDA_INVALIDA');
});

test('getCurrencySymbol refleja la moneda configurada sin fijar el signo de pesos', () => {
  assert.equal(getCurrencySymbol('EUR', 'es-MX'), '€');
  assert.equal(getCurrencySymbol('EUR', 'en-US'), '€');
  assert.equal(getCurrencySymbol('MXN', 'es-MX'), '$');
  assert.equal(getCurrencySymbol('USD', 'es-MX'), '$');
});

test('formatDate conserva fechas inválidas y respeta es-MX y en-US', () => {
  assert.equal(formatDate('', 'es-MX'), '');
  assert.equal(formatDate('fecha-invalida', 'es-MX'), 'fecha-invalida');

  const isoDate = '2026-12-05';
  const date = new Date(`${isoDate}T00:00:00`);
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  const esDate = formatDate(isoDate, 'es-MX');
  const enDate = formatDate(isoDate, 'en-US');

  assert.equal(esDate, date.toLocaleDateString('es-MX', options));
  assert.equal(enDate, date.toLocaleDateString('en-US', options));
  assert.notEqual(esDate, enDate);
});

test('sanitizeText elimina caracteres de control y respeta la longitud máxima', () => {
  assert.equal(sanitizeText('Hola\u0000\nMundo'), 'HolaMundo');
  assert.equal(sanitizeText('abcdef', 4), 'abcd');
  assert.equal(sanitizeText(null), '');
});

test('uid genera identificadores no vacíos y distintos', () => {
  const first = uid();
  const second = uid();

  assert.equal(typeof first, 'string');
  assert.ok(first.length > 0);
  assert.notEqual(first, second);
});