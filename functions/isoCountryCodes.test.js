import test from 'node:test';
import assert from 'node:assert/strict';
import { iso2ToIso3, isSupportedIso2 } from './isoCountryCodes.js';

test('converts ISO-2 route country codes to ISO-3 boundary identifiers', () => {
  assert.equal(iso2ToIso3('fr'), 'FRA');
  assert.equal(iso2ToIso3('DE'), 'DEU');
  assert.equal(iso2ToIso3('gb'), 'GBR');
  assert.equal(iso2ToIso3('xk'), 'XKO');
});

test('rejects unsupported codes', () => {
  assert.equal(iso2ToIso3('ZZ'), '');
  assert.equal(isSupportedIso2('FR'), true);
  assert.equal(isSupportedIso2('ZZ'), false);
});
