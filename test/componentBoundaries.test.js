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

test('el repositorio Firestore conserva revisiones separadas y publicación transaccional', async () => {
  const repository = await read(
    'src/infrastructure/firebase/firestoreTripRepository.js'
  );
  const revisions = await read(
    'src/infrastructure/firebase/firestoreTripRevisionStore.js'
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
    /await writeRevisionPayload\(db, revisionRef, payload\);[\s\S]*await runTransaction\(db/
  );
  assert.match(repository, /transaction\.set\(tripRef, payload\.summary\)/);
  assert.match(repository, /const revisionRefs = await listRevisionRefs\(tripRef\)/);
  assert.match(repository, /transaction\.delete\(tripRef\)/);
  assert.match(repository, /await deleteRevision\(db, revisionRef\)/);
});

test('geoapifyClient coordina búsquedas sin absorber Firebase, caché ni contexto', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const callable = await read('src/modules/places/geoapifyCallable.js');
  const cache = await read('src/modules/places/geoapifyClientCache.js');
  const query = await read('src/modules/places/geoapifyQuery.js');

  assert.ok(
    lineCount(client) <= 90,
    `geoapifyClient.js volvió a crecer a ${lineCount(client)} líneas`
  );
  assert.match(client, /from '\.\/geoapifyCallable\.js'/);
  assert.match(client, /from '\.\/geoapifyClientCache\.js'/);
  assert.match(client, /from '\.\/geoapifyQuery\.js'/);
  assert.doesNotMatch(client, /connectFunctionsEmulator|localStorage|function contextualQuery/);

  assert.match(callable, /connectFunctionsEmulator/);
  assert.match(callable, /httpsCallable/);
  assert.match(cache, /export function createPersistentCache/);
  assert.match(cache, /localStorage/);
  assert.match(query, /export function contextualQuery/);
  assert.match(query, /export function callableSearchContext/);
});

test('ExpenseEditor coordina vistas sin absorber catálogo ni mutaciones', async () => {
  const editor = await read('src/modules/expenses/ExpenseEditor.jsx');
  const operations = await read('src/modules/expenses/expenseEditorOperations.js');
  const catalog = await read('src/modules/expenses/expenseEditorCatalog.jsx');
  const fixedCards = await read('src/modules/expenses/FixedExpenseCards.jsx');
  const lineItems = await read('src/modules/expenses/ExpenseLineItemsGrid.jsx');

  assert.ok(
    lineCount(editor) <= 150,
    `ExpenseEditor.jsx volvió a crecer a ${lineCount(editor)} líneas`
  );
  assert.match(editor, /<FixedExpenseCards/);
  assert.match(editor, /<ExpenseLineItemsGrid/);
  assert.match(editor, /from '\.\/expenseEditorOperations\.js'/);
  assert.match(editor, /from '\.\/expenseEditorCatalog\.jsx'/);
  assert.doesNotMatch(editor, /IconPlane|BOAT_KEYWORDS|function LineItemsGrid/);

  assert.doesNotMatch(operations, /from 'react'|@tabler\/icons-react/);
  assert.match(operations, /export function updateExpenseItem/);
  assert.match(catalog, /export const EXPENSE_ICONS/);
  assert.match(catalog, /export function transportOtherIcon/);
  assert.match(fixedCards, /className="expenses__grid"/);
  assert.match(lineItems, /moneycard moneycard--lineitem/);
});
