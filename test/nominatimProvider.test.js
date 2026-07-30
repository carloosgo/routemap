import test from 'node:test';
import assert from 'node:assert/strict';

import { createNominatimProvider } from '../src/modules/geocoding/nominatimProvider.js';

test('Nominatim limita resultados, deduplica y descarta coordenadas inválidas', async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl;

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            osm_id: 1,
            osm_type: 'node',
            category: 'place',
            type: 'city',
            lat: '19.4326',
            lon: '-99.1332',
            address: { city: 'Ciudad de México', country: 'México', country_code: 'mx' },
          },
          {
            osm_id: 2,
            osm_type: 'node',
            category: 'place',
            type: 'city',
            lat: '19.4',
            lon: '-99.1',
            address: { city: 'Ciudad de México', country: 'México', country_code: 'mx' },
          },
          {
            osm_id: 3,
            osm_type: 'node',
            category: 'place',
            type: 'city',
            lat: '999',
            lon: '10',
            address: { city: 'Inválida', country: 'México', country_code: 'mx' },
          },
        ];
      },
    };
  };

  try {
    const provider = createNominatimProvider();
    const results = await provider.search('Ciudad de México', { limit: 50 });

    assert.equal(results.length, 1);
    assert.equal(results[0].countryCode, 'MX');
    assert.equal(results[0].name, 'Ciudad de México');
    assert.match(requestedUrl, /limit=30/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Nominatim reutiliza caché para la misma consulta', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            osm_id: 10,
            osm_type: 'node',
            category: 'place',
            type: 'city',
            lat: '48.8566',
            lon: '2.3522',
            address: { city: 'Paris', country: 'France', country_code: 'fr' },
          },
        ];
      },
    };
  };

  try {
    const provider = createNominatimProvider();
    await provider.search('Paris', { limit: 6 });
    await provider.search('  PARIS  ', { limit: 6 });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Nominatim rechaza respuestas con forma inválida', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { unexpected: true };
    },
  });

  try {
    const provider = createNominatimProvider();
    await assert.rejects(provider.search('Madrid'), /invalid response/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
