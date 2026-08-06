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

test('tripModel conserva una fachada estable sin absorber entidades ni operaciones', async () => {
  const facade = await read('src/modules/trips/tripModel.js');
  const entities = await read('src/modules/trips/tripEntities.js');
  const operations = await read('src/modules/trips/tripOperations.js');
  const reducer = await read('src/modules/trips/tripReducer.js');
  const hook = await read('src/modules/trips/useTrip.js');

  assert.ok(
    lineCount(facade) <= 40,
    `tripModel.js volvió a crecer a ${lineCount(facade)} líneas`
  );
  assert.match(facade, /from '\.\/tripEntities\.js'/);
  assert.match(facade, /from '\.\/tripOperations\.js'/);
  assert.doesNotMatch(facade, /sanitizeText|expensesTotal|function nowISO/);

  assert.match(entities, /export function normalizeTrip/);
  assert.match(entities, /export function createSegment/);
  assert.match(operations, /export function appendSegment/);
  assert.match(operations, /export function reorderSegments/);
  assert.doesNotMatch(`${entities}\n${operations}\n${reducer}`, /from 'react'/);
  assert.match(hook, /tripReducer/);
  assert.doesNotMatch(hook, /switch\s*\(action\.type\)/);
});

test('el repositorio Firestore orquesta viajes sin absorber lotes y subcolecciones', async () => {
  const repository = await read(
    'src/infrastructure/firebase/firestoreTripRepository.js'
  );
  const revisions = await read(
    'src/infrastructure/firebase/firestoreTripRevisionStore.js'
  );

  assert.ok(
    lineCount(repository) <= 130,
    `firestoreTripRepository.js volvió a crecer a ${lineCount(repository)} líneas`
  );
  assert.match(repository, /from '\.\/firestoreTripRevisionStore\.js'/);
  assert.doesNotMatch(
    repository,
    /writeBatch|WRITE_BATCH_LIMIT|documentIdForPosition|TRIP_REVISION_COLLECTIONS/
  );

  assert.match(revisions, /const WRITE_BATCH_LIMIT = 400/);
  assert.match(revisions, /export async function writeRevisionPayload/);
  assert.match(revisions, /complete: true/);
  assert.match(revisions, /export async function cleanupOldRevisions/);
  assert.match(revisions, /export async function listRevisionRefs/);

  assert.match(
    repository,
    /await writeRevisionPayload\(db, revisionRef, payload\);[\s\S]*await setDoc\(tripRef, payload\.summary\);/
  );
  assert.match(
    repository,
    /const revisionRefs = await listRevisionRefs\(tripRef\);[\s\S]*await deleteDoc\(tripRef\);[\s\S]*await deleteRevision\(db, revisionRef\);/
  );
});
