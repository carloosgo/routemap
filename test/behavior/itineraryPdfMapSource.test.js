// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCountryContainingPoint,
  loadWorldAtlasCountries,
} from '../../src/modules/export/worldAtlasGeometry.js';

test('carga la geometría mundial incluida en la app sin depender de red', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('PDF map geometry must not use runtime network');
  };

  try {
    const countries = await loadWorldAtlasCountries();
    assert.equal(fetchCalls, 0);
    assert.ok(countries.length > 100);
    assert.equal(findCountryContainingPoint(countries, 2.35, 48.86)?.name, 'France');
    assert.equal(findCountryContainingPoint(countries, 13.405, 52.52)?.name, 'Germany');
    assert.equal(findCountryContainingPoint(countries, -3.7, 40.4)?.name, 'Spain');
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
});
