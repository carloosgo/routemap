// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el guardado central pide nombre, valida ruta y persiste sin confirmación nativa', async () => {
  const [app, saveFlow, topbar] = await Promise.all([
    read('src/App.jsx'),
    read('src/app/useTripSaveFlow.js'),
    read('src/app/AppTopbar.jsx'),
  ]);

  assert.match(app, /useTripSaveFlow/);
  assert.match(topbar, /trip-save-popover/);
  assert.match(topbar, /value=\{tripNameDraft\}/);

  const requireName = saveFlow.indexOf('if (!requestedName)');
  const validateRoute = saveFlow.indexOf('if (!hasSavableRoute(trip))');
  const persist = saveFlow.indexOf('persistence.markSaving()');
  const save = saveFlow.indexOf('const savedTrip = await saveTrip(tripToSave)');
  const adopt = saveFlow.indexOf('persistence.markSaved({ adoptNextTrip: true })');
  const loadPersisted = saveFlow.indexOf('loadTrip(savedTrip)');

  assert.ok(requireName >= 0, 'debe exigir nombre mediante el popover antes de guardar');
  assert.ok(validateRoute > requireName, 'debe validar la ruta después de resolver el nombre');
  assert.ok(persist > validateRoute, 'no debe comenzar persistencia antes de validar la ruta');
  assert.ok(save > persist, 'debe persistir el candidato después de entrar al estado de guardado');
  assert.ok(adopt > save, 'debe marcar como guardada la versión persistida después del save');
  assert.ok(loadPersisted > adopt, 'debe adoptar la versión persistida solo después del guardado exitoso');
  assert.doesNotMatch(saveFlow, /globalThis\.confirm|confirmSaveTrip/);
  assert.doesNotMatch(saveFlow, /renameTrip/);
});
