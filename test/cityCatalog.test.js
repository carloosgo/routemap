// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CITY_CATALOG_COLLECTIONS,
  CITY_CATALOG_SCHEMA_VERSION,
  cityCatalogProviderRefDocumentId,
  cityCatalogQueryDocumentId,
  evaluateCityCatalogProjection,
} from '../functions/cityCatalog.js';

function atlasCity(overrides = {}) {
  return {
    id: 'atlas-city-1',
    name: 'Roma',
    displayName: 'Roma, Italia',
    region: 'Lazio',
    regionCode: 'LAZ',
    country: 'Italia',
    countryCode: 'IT',
    lat: 41.8933,
    lon: 12.4829,
    ...overrides,
  };
}

test('el catálogo usa namespaces propios, schema explícito y fingerprints sin consulta en claro', () => {
  assert.equal(CITY_CATALOG_SCHEMA_VERSION, 1);
  assert.deepEqual(CITY_CATALOG_COLLECTIONS, {
    cities: 'cityCatalog',
    providerRefs: 'cityCatalogProviderRefs',
    queries: 'cityCatalogQueries',
  });

  const first = cityCatalogQueryDocumentId('rome', 'es');
  const second = cityCatalogQueryDocumentId('rome', 'es');
  const english = cityCatalogQueryDocumentId('rome', 'en');

  assert.equal(first, second);
  assert.notEqual(first, english);
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /rome/i);
});

test('provider refs son deterministas pero el namespace no confunde proveedores', () => {
  const geoapify = cityCatalogProviderRefDocumentId('geoapify', 'provider-place-1');
  const other = cityCatalogProviderRefDocumentId('other', 'provider-place-1');

  assert.equal(geoapify.length, 64);
  assert.notEqual(geoapify, other);
  assert.equal(
    geoapify,
    cityCatalogProviderRefDocumentId('geoapify', 'provider-place-1')
  );
});

test('una proyección fresca devuelve snapshots Atlas y una vencida queda disponible como stale fallback', () => {
  const now = 1_000_000;
  const fresh = evaluateCityCatalogProjection({
    schemaVersion: 1,
    results: [atlasCity(), atlasCity({ id: 'atlas-city-2', name: 'Rome', country: 'Estados Unidos', countryCode: 'US' })],
    revalidateAfter: { toMillis: () => now + 1 },
  }, { nowMs: now, limit: 1 });

  assert.equal(fresh.status, 'fresh');
  assert.equal(fresh.results.length, 1);
  assert.equal(fresh.results[0].id, 'atlas-city-1');

  const stale = evaluateCityCatalogProjection({
    schemaVersion: 1,
    results: [atlasCity()],
    revalidateAfter: { toMillis: () => now - 1 },
  }, { nowMs: now });

  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.results.map((city) => city.displayName), ['Roma, Italia']);
});

test('proyecciones corruptas o con coordenadas inválidas se tratan como miss', () => {
  assert.deepEqual(
    evaluateCityCatalogProjection({ schemaVersion: 999, results: [atlasCity()] }),
    { status: 'miss', results: [] }
  );
  assert.deepEqual(
    evaluateCityCatalogProjection({
      schemaVersion: 1,
      results: [atlasCity({ lat: 200 })],
      revalidateAfter: { toMillis: () => Date.now() + 10_000 },
    }),
    { status: 'miss', results: [] }
  );
});

test('el catálogo separa referencia canónica, provider mapping y proyección de búsqueda', async () => {
  const source = await readFile('functions/cityCatalog.js', 'utf8');

  assert.match(source, /runTransaction/);
  assert.match(source, /collection\(CITY_CATALOG_COLLECTIONS\.cities\)\.doc\(\)/);
  assert.match(source, /cityId: cityRef\.id/);
  assert.match(source, /providerRefs/);
  assert.match(source, /sourceAttribution/);
  assert.match(source, /revalidateAfter: Timestamp\.fromMillis/);
  assert.doesNotMatch(source, /expiresAt/);
});
