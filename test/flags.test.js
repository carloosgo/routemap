import test from 'node:test';
import assert from 'node:assert/strict';
import { flagEmoji, flagImageUrl } from '../src/modules/flags/flags.js';

test('flagImageUrl acepta códigos ISO alpha-2 y normaliza mayúsculas', () => {
  assert.equal(flagImageUrl('MX', 20), 'https://flagcdn.com/w20/mx.png');
  assert.equal(flagImageUrl(' us '), 'https://flagcdn.com/w40/us.png');
});

test('flagImageUrl rechaza códigos inválidos y usa ancho seguro', () => {
  assert.equal(flagImageUrl('../mx', 20), null);
  assert.equal(flagImageUrl('MEX', 20), null);
  assert.equal(flagImageUrl('DE', 999), 'https://flagcdn.com/w40/de.png');
});

test('flagEmoji genera emoji únicamente para códigos ISO válidos', () => {
  assert.equal(flagEmoji('mx'), '🇲🇽');
  assert.equal(flagEmoji('US'), '🇺🇸');
  assert.equal(flagEmoji('1A'), '');
  assert.equal(flagEmoji(null), '');
});
