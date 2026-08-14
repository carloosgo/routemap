import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el diálogo de borrado bloquea confirmaciones duplicadas mientras lifecycle está pendiente', async () => {
  const app = await read('src/App.jsx');
  const dialog = await read('src/app/TripDeleteDialog.jsx');
  const messages = await read('src/i18n/storageV4.js');

  assert.match(app, /const \[deletePending, setDeletePending\] = useState\(false\)/);
  assert.match(app, /const deleteInFlightRef = useRef\(false\)/);
  assert.match(app, /if \(!tripToDelete \|\| deleteInFlightRef\.current\) return/);
  assert.match(
    app,
    /deleteInFlightRef\.current = true;[\s\S]*setDeletePending\(true\);[\s\S]*finally \{[\s\S]*deleteInFlightRef\.current = false;[\s\S]*setDeletePending\(false\)/
  );
  assert.match(app, /isDeleting=\{deletePending\}/);

  assert.match(dialog, /if \(!isDeleting\) setTripToDelete\(null\)/);
  assert.equal((dialog.match(/disabled=\{isDeleting\}/g) || []).length, 2);
  assert.match(dialog, /aria-busy=\{isDeleting\}/);
  assert.match(dialog, /isDeleting \? t\('deletingTrip'\) : t\('delete'\)/);

  assert.match(messages, /deletingTrip: 'Eliminando…'/);
  assert.match(messages, /deletingTrip: 'Deleting…'/);
});
