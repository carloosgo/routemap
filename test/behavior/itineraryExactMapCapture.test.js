// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { TextDecoder } from 'node:util';
import { computeViewportCaptureCrop } from '../../src/modules/export/itineraryExactMapCapture.js';
import { addJpegImage } from '../../src/modules/export/pdfHybridDocument.js';
import { VectorPdfPage } from '../../src/modules/export/pdfVectorDocument.js';

test('recorta los píxeles exactos del mapa cuando la pestaña capturada está a escala 2x', () => {
  assert.deepEqual(
    computeViewportCaptureCrop(
      { left: 500, top: 100, right: 1600, bottom: 900 },
      {
        viewportWidth: 1920,
        viewportHeight: 1080,
        frameWidth: 3840,
        frameHeight: 2160,
      }
    ),
    { x: 1000, y: 200, width: 2200, height: 1600 }
  );
});

test('compensa letterboxing sin deformar las coordenadas del mapa', () => {
  assert.deepEqual(
    computeViewportCaptureCrop(
      { left: 100, top: 50, right: 900, bottom: 450 },
      {
        viewportWidth: 1000,
        viewportHeight: 500,
        frameWidth: 1200,
        frameHeight: 800,
      }
    ),
    { x: 120, y: 160, width: 960, height: 480 }
  );
});

test('el JPEG literal del mapa se inserta con contain y conserva su proporción', () => {
  const page = new VectorPdfPage();
  addJpegImage(
    page,
    {
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      pixelWidth: 400,
      pixelHeight: 200,
    },
    { x: 10, y: 20, width: 200, height: 200 },
    'ExactMap',
    { fit: 'contain' }
  );

  const source = new TextDecoder('windows-1252').decode(page.toBytes());
  assert.match(source, /q 200 0 0 100 10 425\.28 cm \/ExactMap Do Q/);
});