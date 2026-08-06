import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const lineCount = (content) => content.split('\n').length;

test('App coordina módulos sin contener menús, responsive ni diálogo completos', async () => {
  const app = await read('src/App.jsx');
  const editor = await read('src/app/AppEditorModule.jsx');
  const workspace = await read('src/app/AppWorkspace.jsx');
  const dialog = await read('src/app/TripDeleteDialog.jsx');
  const editorState = await read('src/app/useAppEditorState.js');

  assert.ok(lineCount(app) <= 260, `App.jsx volvió a crecer a ${lineCount(app)} líneas`);
  assert.match(app, /<AppEditorModule/);
  assert.match(app, /<AppWorkspace/);
  assert.match(app, /<TripDeleteDialog/);
  assert.match(app, /const editorState = useAppEditorState\(tripStore\)/);
  assert.match(app, /editorState=\{editorState\}/);
  assert.doesNotMatch(app, /editor-module__more-menu|mobiletabs|confirm__scrim/);

  assert.match(editor, /editor-module__tabs/);
  assert.match(workspace, /workspace__desktop/);
  assert.match(workspace, /workspace__mobile/);
  assert.match(workspace, /mobiletabs/);
  assert.match(dialog, /confirm__scrim/);
  assert.match(editorState, /useCollapseSegmentsOnTripChange/);
});

test('RouteMap coordina módulos sin volver a absorber modelo, búsqueda o marcadores', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const model = await read('src/modules/map/routeMapModel.js');
  const setup = await read('src/modules/map/routeMapSetup.js');
  const search = await read('src/modules/map/usePlaceSearch.js');
  const markers = await read('src/modules/map/usePlaceResultMarkers.js');
  const form = await read('src/modules/map/PlaceSearchForm.jsx');

  assert.ok(
    lineCount(routeMap) <= 280,
    `RouteMap.jsx volvió a crecer a ${lineCount(routeMap)} líneas`
  );
  assert.match(routeMap, /buildMapFeatureData/);
  assert.match(routeMap, /usePlaceSearch/);
  assert.match(routeMap, /usePlaceResultMarkers/);
  assert.match(routeMap, /<PlaceSearchForm/);
  assert.doesNotMatch(routeMap, /function adaptiveCurve|function markerElement|async function submitSearch/);

  assert.match(model, /export function adaptiveCurve/);
  assert.match(setup, /export function addBaseSourcesAndLayers/);
  assert.match(search, /async function submitSearch/);
  assert.match(markers, /new maplibregl\.Marker/);
  assert.match(form, /className="geo-search"/);
});
