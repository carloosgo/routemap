// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('las notas de Mis Rutas conservan la misma superficie visual que las notas de trayecto', async () => {
  const appCss = await read('src/App.css');
  const placementCss = await read('src/app/NotePanelPlacement.css');
  const placesPanel = await read('src/modules/places/TripPlacesPanel.jsx');

  assert.match(
    appCss,
    /\.segnote\s*\{[^}]*width:\s*300px;[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*0 6px 24px rgba\(0, 0, 0, 0\.16\);/s,
    'la prueba debe permanecer anclada a la geometría canónica de la nota de trayecto'
  );

  for (const className of ['segnote__head', 'segnote__title', 'segnote__x', 'segnote__textarea', 'segnote__foot']) {
    assert.match(
      placesPanel,
      new RegExp(`className="${className}"`),
      `la nota de lugar debe reutilizar ${className}`
    );
  }

  assert.match(
    placementCss,
    /\.confirm__scrim:has\(> \.trip-place-note-dialog\)\s*\{[^}]*background:\s*transparent;/s,
    'la nota de lugar no debe introducir el scrim oscuro del diálogo de eliminación'
  );

  assert.match(
    placementCss,
    /\.trip-place-note-dialog\s*\{[^}]*width:\s*min\(300px, calc\(100vw - 32px\)\);[^}]*max-width:\s*300px;[^}]*border-radius:\s*12px;[^}]*background:\s*#fff;[^}]*box-shadow:\s*0 6px 24px rgba\(0, 0, 0, 0\.16\);[^}]*animation:\s*segnote-in 0\.14s ease;/s,
    'la superficie de Mis Rutas debe compartir ancho, radio, fondo, sombra y entrada de .segnote'
  );

  assert.match(
    placementCss,
    /\.trip-place-note-dialog \.segnote__textarea\s*\{[^}]*width:\s*auto;/s,
    'el textarea debe volver al dimensionamiento natural de la nota canónica'
  );

  assert.match(
    placesPanel,
    /maxLength=\{500\}[\s\S]*?onChange=\{\(event\) => updatePlace\?\.\(notePlace\.id, \{ note: event\.target\.value \}\)\}/,
    'la paridad visual no debe alterar límite ni autosave de la nota de lugar'
  );
});
