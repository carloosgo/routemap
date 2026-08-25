import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('la normalización de ciudades no reintroduce heurísticas GIS por distancia o condado', async () => {
  const source = await readFile('functions/geoapifyCityUtils.js', 'utf8');

  assert.doesNotMatch(source, /distanceKm|toRadians|countyKey|sameCounty|separation/);
});
