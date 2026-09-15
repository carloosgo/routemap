// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/modules/export/itineraryPdfHybrid.js'), 'utf8');

test('el PDF usa fondo blanco y coloca métricas antes del mapa en la portada', () => {
  assert.match(source, /page\.rect\(0, 0, PAGE\.width, PAGE\.height, \{ fill: '#ffffff' \}\)/);
  const metricsCall = source.indexOf('drawMetrics(page, model, intlLocale, t, metrics);');
  const mapImageCall = source.indexOf("addJpegImage(page, mapImage, map, 'ItineraryMap'");
  assert.ok(metricsCall >= 0 && mapImageCall >= 0 && metricsCall < mapImageCall);
  assert.match(source, /y: metrics\.y \+ metrics\.height \+ gap/);
});

test('las cards usan interlineado compacto y numeración más legible', () => {
  assert.match(source, /const lineHeight = 9\.5;/);
  assert.match(source, /page\.circle\(markerX, headerCenterY, 7\.5/);
  assert.match(source, /size: Number\(item\.number\) >= 10 \? 6\.6 : 7\.4/);
  assert.match(source, /layout\.titleSize \* 0\.40/);
});
