// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCountryContainingPoint,
  loadWorldAtlasCountries,
} from '../../src/modules/export/worldAtlasGeometry.js';

const CACHE_KEY = 'atlas:itinerary-pdf:world-atlas:110m:v1';

function testTopology() {
  return {
    type: 'Topology',
    transform: {
      scale: [1, 1],
      translate: [0, 0],
    },
    arcs: [
      [[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]],
    ],
    objects: {
      countries: {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'Polygon',
            arcs: [[0]],
            id: '999',
            properties: { name: 'Testland' },
          },
        ],
      },
    },
  };
}

test('reutiliza el atlas vectorial cacheado sin depender de una descarga remota', async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const raw = JSON.stringify(testTopology());
  const values = new Map([[CACHE_KEY, raw]]);
  let fetchCalls = 0;

  globalThis.localStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('remote fetch should not run');
  };

  try {
    const countries = await loadWorldAtlasCountries();
    assert.equal(fetchCalls, 0);
    assert.equal(countries.length, 1);
    assert.equal(countries[0].name, 'Testland');
    assert.equal(findCountryContainingPoint(countries, 5, 5)?.id, '999');
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
});
