import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDate, formatMoney, sanitizeText, toAmount, uid } from '../src/shared/utils.js';

test('toAmount acepta números válidos y neutraliza valores negativos o inválidos', () => {
  assert.equal(toAmount(12.5), 12.5);
  assert.equal(toAmount('19.99'), 19.99);
  assert.equal(toAmount(-1), 0);
  assert.equal(toAmount('no-es-numero'), 0);
  assert.equal(toAmount(undefined), 0);
});

test('formatMoney aplica moneda y locale sin propagar importes inválidos', () => {
  const formatted = formatMoney('1234.5', 'EUR', 'es-MX');
  assert.match(formatted, /1[,.]234/);
  assert.match(formatted, /€|EUR/);

  const invalidAmount = formatMoney('invalido', 'USD', 'en-US');
  assert.match(invalidAmount, /0/);
});

test('formatMoney usa una salida segura cuando la moneda no es válida', () => {
  assert.equal(formatMoney(10, 'MONEDA_INVALIDA', 'es-MX'), '10.00 MONEDA_INVALIDA');
});

test('formatDate conserva fechas inválidas y formatea fechas ISO válidas', () => {
  assert.equal(formatDate('', 'es-MX'), '');
  assert.equal(formatDate('fecha-invalida', 'es-MX'), 'fecha-invalida');

  const formatted = formatDate('2026-12-05', 'en-US');
  assert.match(formatted, /Dec/);
  assert.match(formatted, /2026/);
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
