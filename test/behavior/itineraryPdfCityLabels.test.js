// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const composerSource = readFileSync(
  resolve('src/modules/export/itineraryStaticMapComposer.js'),
  'utf8'
);
const pdfSource = readFileSync(
  resolve('src/modules/export/itineraryPdfHybrid.js'),
  'utf8'
);

test('el mapa PDF usa etiquetas de ciudad, marcadores compactos y no colorea países', () => {
  assert.match(composerSource, /const MARKER_RADIUS = 6\.35/);
  assert.match(composerSource, /function drawCityLabel/);
  assert.match(composerSource, /ctx\.fillText\(cityName/);
  assert.match(composerSource, /const LABEL_HEIGHT = 18/);
  assert.match(composerSource, /const ATTRIBUTION_GUARD = 27/);
  assert.doesNotMatch(composerSource, /loadWorldAtlasCountries/);
  assert.doesNotMatch(composerSource, /drawCountryTint/);
  assert.doesNotMatch(composerSource, /findCountryContainingPoint/);
});

test('las cards eliminan líneas vacías duplicadas de notas y mantienen interlineado compacto', () => {
  assert.match(pdfSource, /function compactWrappedNoteLines/);
  assert.match(pdfSource, /\.map\(\(paragraph\) => paragraph\.trim\(\)\)/);
  assert.match(pdfSource, /\.filter\(Boolean\)/);
  assert.match(pdfSource, /wrapPdfText\(paragraph, maxWidth, fontSize, false\)\.filter\(Boolean\)/);
  assert.match(pdfSource, /const lineHeight = 9\.25/);
});
