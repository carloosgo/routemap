// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('los nombres largos usan hasta dos lineas sin ensanchar ni desalinear el itinerario', async () => {
  const [css, autocomplete] = await Promise.all([
    read('src/modules/trips/ItineraryCompactTen.css'),
    read('src/components/CityAutocomplete.jsx'),
  ]);

  const cityNameBlock = css.match(
    /\.editor-module--itinerary \.itinerary-stop__picker \.autocomplete__selected-value,[\s\S]*?\{([\s\S]*?)\n {2}\}/
  )?.[1] || '';

  assert.match(css, /grid-template-columns:[\s\S]{0,220}126px[\s\S]{0,120}minmax\(0, 1fr\);/);
  assert.match(css, /grid-template-columns:\s*minmax\(60px, 1fr\) 78px repeat\(3, 14px\);/);
  assert.match(css, /min-height:\s*40px;[\s\S]{0,80}height:\s*40px;/);

  assert.match(cityNameBlock, /-webkit-line-clamp:\s*2;/);
  assert.match(cityNameBlock, /-webkit-box-orient:\s*vertical;/);
  assert.match(cityNameBlock, /white-space:\s*normal;/);
  assert.match(cityNameBlock, /word-break:\s*normal;/);
  assert.match(cityNameBlock, /transform:\s*translateY\(-50%\);/);
  assert.doesNotMatch(cityNameBlock, /-webkit-line-clamp:\s*1;/);
  assert.doesNotMatch(cityNameBlock, /white-space:\s*nowrap;/);

  assert.match(
    autocomplete,
    /className="autocomplete__selected-value"\s*title=\{value\?\.name\}\s*aria-hidden="true"/
  );
});