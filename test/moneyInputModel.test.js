// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoneyDraft,
  formatMoneyValue,
  parseMoneyDraft,
  sanitizeMoneyDraft,
} from '../src/components/moneyInputModel.js';

test('expense amount drafts accept only digits and one decimal amount', () => {
  assert.equal(sanitizeMoneyDraft('12abc34'), '1234');
  assert.equal(sanitizeMoneyDraft('$1,234.567xyz'), '1234.56');
  assert.equal(sanitizeMoneyDraft('1.2.3'), '1.23');
  assert.equal(sanitizeMoneyDraft('-55'), '55');
});

test('expense amount drafts add comma thousands separators without changing numeric value', () => {
  assert.equal(formatMoneyDraft('999'), '999');
  assert.equal(formatMoneyDraft('1000'), '1,000');
  assert.equal(formatMoneyDraft('4322.22'), '4,322.22');
  assert.equal(formatMoneyDraft('34059'), '34,059');
  assert.equal(parseMoneyDraft('125,430.50'), 125430.5);
});

test('stored numeric values format only for display and zero remains an empty capture field', () => {
  assert.equal(formatMoneyValue(0), '');
  assert.equal(formatMoneyValue(200), '200');
  assert.equal(formatMoneyValue(4322.22), '4,322.22');
  assert.equal(formatMoneyValue(34059), '34,059');
});
