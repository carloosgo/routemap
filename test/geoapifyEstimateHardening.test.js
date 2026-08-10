import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('el enriquecimiento de lugares funciona también en viajes locales sin sesión', async () => {
  const source = await read('functions/geoapifyPlaceFunctions.js');
  const enrichment = source.slice(source.indexOf('export const geoapifyPlaceEnrichment'));

  assert.match(enrichment, /enforceAppCheck: false/);
  assert.match(enrichment, /secrets: \[GEOAPIFY_API_KEY\]/);
  assert.match(enrichment, /enforceQuota\(db, request, QUOTAS\.placeDetails\)/);
});

test('las estimaciones rápidas usan Route Matrix sin descargar geometrías largas', async () => {
  const backend = await read('functions/geoapifyRouteFunctions.js');
  const client = await read('src/modules/routes/geoapifyRouteClient.js');

  assert.match(backend, /\/v1\/routematrix/);
  assert.match(backend, /mode === 'transit' \? 'approximated_transit' : mode/);
  assert.match(backend, /sources_to_targets/);
  assert.match(backend, /if \(estimateOnly\)/);
  assert.match(client, /estimateOnly: true/);
});
