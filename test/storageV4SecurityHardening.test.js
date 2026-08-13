import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { providerRequestMetricDescriptor } from '../functions/geoapifySupport.js';
import { uid } from '../src/shared/utils.js';

test('uid usa una fuente criptográfica y produce UUID v4', async () => {
  const value = uid();
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  const source = await readFile(new URL('../src/shared/utils.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.match(source, /randomUUID|getRandomValues/);
});

test('provider metrics solo reconoce dominio exacto o subdominio real', () => {
  assert.equal(
    providerRequestMetricDescriptor('https://api.geoapify.com/v1/geocode/search').provider,
    'geoapify'
  );
  assert.equal(
    providerRequestMetricDescriptor('https://geoapify.com/v1/geocode/search').provider,
    'geoapify'
  );
  assert.equal(
    providerRequestMetricDescriptor('https://evilgeoapify.com/v1/geocode/search').provider,
    'other'
  );
  assert.equal(
    providerRequestMetricDescriptor('https://places.googleapis.com/v1/places:searchText').provider,
    'google'
  );
  assert.equal(
    providerRequestMetricDescriptor('https://evilgoogleapis.com/v1/places:searchText').provider,
    'other'
  );
});
