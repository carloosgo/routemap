// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mapPaneSource = readFileSync(resolve('src/app/AppMapPane.jsx'), 'utf8');
const shareButtonSource = readFileSync(resolve('src/app/ItineraryShareButton.jsx'), 'utf8');
const sharedPageSource = readFileSync(resolve('src/app/SharedItineraryPage.jsx'), 'utf8');
const repositorySource = readFileSync(resolve('src/modules/share/itineraryShareRepository.js'), 'utf8');
const mainSource = readFileSync(resolve('src/main.jsx'), 'utf8');
const staticMapSource = readFileSync(resolve('src/modules/export/googleStaticMapClient.js'), 'utf8');
const rulesSource = readFileSync(resolve('firestore.rules'), 'utf8');

test('Compartir aparece junto al exportador PDF y crea una URL pública de solo lectura', () => {
  const pdfIndex = mapPaneSource.indexOf('<ItineraryPdfExportButton');
  const shareIndex = mapPaneSource.indexOf('<ItineraryShareButton');
  assert.ok(pdfIndex >= 0 && shareIndex > pdfIndex);
  assert.match(shareButtonSource, /createItineraryShare\(model/);
  assert.match(shareButtonSource, /\/share\/\$\{encodeURIComponent\(shareId\)\}/);
  assert.match(shareButtonSource, /navigatorRef\?\.share/);
  assert.match(shareButtonSource, /clipboard\?\.writeText/);
});

test('la vista compartida usa cabecera, mapa y ciudades desplegables con fecha, costo y notas', () => {
  assert.ok(mainSource.includes("match(/^\\/share\\/([^/]+)\\/?$/)"));
  assert.match(sharedPageSource, /loadItineraryShare\(shareId\)/);
  assert.match(sharedPageSource, /loadItineraryGoogleStaticMap\(model/);
  assert.match(sharedPageSource, /composeItineraryStaticMap\(model, baseMap\)/);
  assert.match(sharedPageSource, /<details className="shared-itinerary__city"/);
  assert.match(sharedPageSource, /formatMoney\(stop\.total/);
  assert.match(sharedPageSource, /String\(stop\.note \|\| ''\)\.trim\(\)/);
});

test('el snapshot compartido no publica el documento privado del viaje y sólo permite get público', () => {
  assert.match(repositorySource, /const SHARE_COLLECTION = 'itineraryShares'/);
  assert.match(repositorySource, /buildPublicItineraryShareModel/);
  assert.doesNotMatch(repositorySource, /routeConnections|places|expenses/);
  assert.match(rulesSource, /match \/itineraryShares\/\{shareId\}/);
  assert.match(rulesSource, /allow get: if true/);
  assert.match(rulesSource, /allow list: if false/);
  assert.match(rulesSource, /request\.auth\.uid == request\.resource\.data\.ownerId/);
  assert.match(rulesSource, /allow update, delete: if false/);
});

test('el mapa compartido calcula un viewport propio para mostrar la ruta sin depender del mapa abierto', () => {
  assert.match(staticMapSource, /export async function loadItineraryGoogleStaticMap/);
  assert.match(staticMapSource, /itineraryMapViewport\(entries/);
  assert.match(staticMapSource, /zoomOffset: 0/);
  assert.match(staticMapSource, /tileSize: 256/);
});
