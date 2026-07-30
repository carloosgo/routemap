import test from 'node:test';
import assert from 'node:assert/strict';
import es from '../src/i18n/es.js';
import en from '../src/i18n/en.js';

function sortedKeys(dictionary) {
  return Object.keys(dictionary).sort();
}

test('los diccionarios español e inglés contienen las mismas claves', () => {
  assert.deepEqual(sortedKeys(en), sortedKeys(es));
});

test('ninguna traducción registrada está vacía o tiene un tipo inválido', () => {
  for (const [locale, dictionary] of Object.entries({ es, en })) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${locale}.${key} debe ser texto`);
      assert.notEqual(value.trim(), '', `${locale}.${key} no puede estar vacío`);
    }
  }
});

test('las claves críticas de operación existen en todos los idiomas', () => {
  const required = [
    'appName',
    'newTrip',
    'saveTrip',
    'saveValidationError',
    'segments',
    'origin',
    'destination',
    'loading',
    'noResults',
  ];

  for (const key of required) {
    assert.equal(typeof es[key], 'string');
    assert.equal(typeof en[key], 'string');
  }
});
