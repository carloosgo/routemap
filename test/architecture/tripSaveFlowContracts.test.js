// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el guardado central pide nombre, valida ruta y confirma antes de persistir', async () => {
  const [app, saveFlow] = await Promise.all([
    read('src/App.jsx'),
    read('src/app/useTripSaveFlow.js'),
  ]);

  assert.match(app, /useTripSaveFlow/);

  const requireName = saveFlow.indexOf('if (!requestedName)');
  const validateRoute = saveFlow.indexOf('if (!hasSavableRoute(trip))');
  const confirmSave = saveFlow.indexOf("globalThis.confirm(t('confirmSaveTrip'))");
  const persist = saveFlow.indexOf('persistence.markSaving()');

  assert.ok(requireName >= 0, 'debe exigir nombre antes de guardar');
  assert.ok(validateRoute > requireName, 'debe validar la ruta despues del nombre');
  assert.ok(confirmSave > validateRoute, 'debe pedir confirmacion despues de validar la ruta');
  assert.ok(persist > confirmSave, 'no debe comenzar persistencia antes de confirmar');
});
