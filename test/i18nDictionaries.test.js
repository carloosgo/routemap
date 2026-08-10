import test from 'node:test';
import assert from 'node:assert/strict';
import es from '../src/i18n/es.js';
import en from '../src/i18n/en.js';

const localeInvariantKeys = new Set([
  'appName',
  'taxiUber',
  'bus',
  'no',
]);

function sortedKeys(dictionary) {
  return Object.keys(dictionary).sort();
}

test('los diccionarios español e inglés contienen exactamente las mismas claves', () => {
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

test('las traducciones no quedan copiadas entre idiomas salvo términos invariantes', () => {
  const untranslated = sortedKeys(es).filter(
    (key) => es[key].trim() === en[key].trim() && !localeInvariantKeys.has(key)
  );
  assert.deepEqual(
    untranslated,
    [],
    'Estas claves parecen no estar traducidas; agrégalas a localeInvariantKeys solo si deben ser idénticas'
  );
});

test('errores, confirmaciones, placeholders y estados vacíos existen en ambos idiomas', () => {
  const requiredByCategory = {
    errors: [
      'saveValidationError',
      'savedTripMissing',
      'openTripError',
      'citySearchError',
      'placeSearchError',
      'signInError',
    ],
    confirmations: [
      'confirmDelete',
      'confirmDeletePlace',
      'confirmDeleteSegment',
      'savePlacePrompt',
      'confirmImportLocalTrips',
    ],
    placeholders: [
      'tripNamePlaceholder',
      'datePlaceholder',
      'segmentNotePlaceholder',
      'noteTitlePlaceholder',
      'notesPlaceholder',
      'newChecklistItem',
      'otherTransportPlaceholder',
      'itemTypePlaceholder',
      'searchPlacesPlaceholder',
    ],
    emptyStates: [
      'noSavedTrips',
      'noSavedPlaces',
      'noSegments',
      'noResults',
      'noLocalTrips',
    ],
  };

  for (const [category, keys] of Object.entries(requiredByCategory)) {
    for (const key of keys) {
      assert.equal(typeof es[key], 'string', `${category}: falta es.${key}`);
      assert.equal(typeof en[key], 'string', `${category}: falta en.${key}`);
      assert.notEqual(es[key].trim(), '', `${category}: es.${key} está vacío`);
      assert.notEqual(en[key].trim(), '', `${category}: en.${key} está vacío`);
    }
  }
});

test('la navegación principal usa etiquetas naturales en ambos idiomas', () => {
  assert.equal(es.itinerary, 'Itinerario');
  assert.equal(en.itinerary, 'Itinerary');
  assert.equal(es.myRoutes, 'Mis Rutas');
  assert.equal(en.myRoutes, 'My Routes');
});

test('la interfaz usa trayecto en español y leg en inglés sin términos anteriores', () => {
  const spanishUi = Object.values(es).join('\n');
  const englishUi = Object.values(en).join('\n');

  assert.doesNotMatch(spanishUi, /\btramos?\b/i);
  assert.doesNotMatch(englishUi, /\bsegments?\b/i);
  assert.equal(es.addSegment, 'Agregar trayecto');
  assert.equal(es.segmentPlural, 'trayectos');
  assert.equal(en.addSegment, 'Add leg');
  assert.equal(en.segmentPlural, 'legs');
});

test('las claves críticas de operación existen en todos los idiomas', () => {
  const required = [
    'appName',
    'newTrip',
    'saveTrip',
    'segments',
    'origin',
    'destination',
    'loading',
  ];

  for (const key of required) {
    assert.equal(typeof es[key], 'string');
    assert.equal(typeof en[key], 'string');
  }
});
