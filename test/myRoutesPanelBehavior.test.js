// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Mis Rutas conserva el estado del panel al alternar con Notas sin romper el layout flex', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');

  assert.match(editor, /const showRoutes = activeTab !== 'notes'/);
  assert.match(editor, /const showNotes = activeTab === 'notes'/);
  assert.match(editor, /const paneStyle = \{[\s\S]*display: 'flex',[\s\S]*flex: 1,[\s\S]*minHeight: 0,[\s\S]*flexDirection: 'column'/);
  assert.match(editor, /style=\{showRoutes \? paneStyle : \{ display: 'none' \}\}/);
  assert.match(editor, /style=\{showNotes \? paneStyle : \{ display: 'none' \}\}/);
  assert.doesNotMatch(editor, /display: showRoutes \? 'contents' : 'none'/);
  assert.doesNotMatch(editor, /display: showNotes \? 'contents' : 'none'/);
  assert.match(editor, /const routesPane = \([\s\S]*?<TripDayRoutesPanel/);
  assert.match(editor, /const notesPane = \([\s\S]*?<AppEditorPane/);
});

test('sin rango global Mis Rutas pide las fechas con el calendario existente', async () => {
  const panel = await read('src/modules/places/TripDayRoutesPanel.jsx');
  const messages = await read('src/i18n/unifiedSearchMessages.js');

  assert.match(panel, /if \(!hasTripDates\)/);
  assert.match(panel, /t\('chooseTripDates'\)/);
  assert.match(panel, /<CalendarDateInput[\s\S]*value=\{trip\.startDate \|\| ''\}/);
  assert.match(panel, /<CalendarDateInput[\s\S]*value=\{trip\.endDate \|\| ''\}/);
  assert.match(panel, /alignItems: 'center'/);
  assert.match(panel, /justifyContent: 'center'/);
  assert.match(messages, /chooseTripDates:/);
});

test('Mis Rutas usa Día como única jerarquía y coloca ciudad y lugares directamente en ese día', async () => {
  const panel = await read('src/modules/places/TripDayRoutesPanel.jsx');

  assert.match(panel, /className="trip-day trip-day--flat"/);
  assert.match(panel, /assignments\.map\(renderCityToken\)/);
  assert.match(panel, /const entries = dayPlaceEntries\(assignments\)/);
  assert.match(panel, /entries\.map\(\(\{ place, groupKey, nextPlace \}\) => renderPlace/);
  assert.match(panel, /collapsedDays\.has\(calendarDay\.date\)/);
  assert.doesNotMatch(panel, /function renderAssignment/);
  assert.doesNotMatch(panel, /className="trip-city trip-day-city"/);
});

test('la cabecera de fechas abre calendarios globales y actualiza el mismo rango del viaje', async () => {
  const header = await read('src/app/TripSummaryHeader.jsx');
  const app = await read('src/App.jsx');

  assert.match(header, /const \[showDateEditor, setShowDateEditor\] = useState\(false\)/);
  assert.match(header, /className="trip-summary__metric--dates"/);
  assert.match(header, /onClick=\{\(\) => setShowDateEditor/);
  assert.match(header, /<CalendarDateInput[\s\S]*value=\{trip\.startDate \|\| ''\}/);
  assert.match(header, /<CalendarDateInput[\s\S]*value=\{trip\.endDate \|\| ''\}/);
  assert.match(header, /updateTripDates\?\.\(\{ startDate \}\)/);
  assert.match(header, /updateTripDates\?\.\(\{ endDate \}\)/);
  assert.match(app, /updateTripDates=\{updateTripDates\}/);
});

test('cada día puede eliminarse y la operación se ejecuta mediante un plan de colapso testeable', async () => {
  const panel = await read('src/modules/places/TripDayRoutesPanel.jsx');
  const editor = await read('src/app/AppEditorModule.jsx');
  const hook = await read('src/modules/trips/useTrip.js');
  const planner = await read('src/modules/trips/tripDayRemoval.js');

  assert.match(panel, /removeTripDay\?\.\(calendarDay\.date\)/);
  assert.match(editor, /removeTripDay=\{removeTripDay\}/);
  assert.match(hook, /planTripDayRemoval\(trip, dateToRemove\)/);
  assert.match(planner, /removePlaceIds/);
  assert.match(planner, /movePlaces/);
  assert.match(planner, /segmentPatches/);
  assert.match(planner, /tripDatePatch/);
});

test('la vista día-primero no reintroduce lugares pendientes y eliminar lugar se presenta como X', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const panel = await read('src/modules/places/TripDayRoutesPanel.jsx');

  assert.doesNotMatch(panel, /pendingPlaces|trip-city__pending-hint|placeWaitingForDates/);
  assert.match(editor, /trip-place__delete svg \{ display: none; \}/);
  assert.match(editor, /trip-place__delete::before/);
  assert.match(editor, /content: '×'/);
});

test('eliminar ciudad elimina primero sus lugares y luego el segmento', async () => {
  const hook = await read('src/modules/trips/useTrip.js');
  const dialog = await read('src/modules/trips/SegmentDeleteDialog.jsx');

  assert.match(hook, /trip\.places \|\| \[\]/);
  assert.match(hook, /filter\(\(place\) => place\.segmentId === segmentId\)/);
  assert.match(hook, /type: TRIP_ACTIONS\.removePlace/);
  assert.match(hook, /dispatch\(\{ type: TRIP_ACTIONS\.removeSegment, segmentId \}\)/);
  assert.doesNotMatch(dialog, /blocked|segmentHasPlannedPlaces|confirmOnly/);
});

test('Ciudades y Lugares viven abajo a la izquierda del mapa', async () => {
  const pane = await read('src/app/AppMapPane.jsx');

  assert.match(pane, /position: 'absolute'/);
  assert.match(pane, /left: '10px'/);
  assert.match(pane, /bottom: '28px'/);
  assert.match(pane, /className="my-routes-map-mode"/);
  assert.match(pane, /style=\{\{ position: 'static' \}\}/);
});
