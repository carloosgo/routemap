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

test('RouteMap coordina un solo mapa sin absorber implementación de Google o búsqueda', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const model = await read('src/modules/map/routeMapModel.js');
  const search = await read('src/modules/map/usePlaceSearch.js');
  const form = await read('src/modules/map/PlaceSearchForm.jsx');

  assert.ok(
    lineCount(routeMap) <= 60,
    `RouteMap.jsx volvió a crecer a ${lineCount(routeMap)} líneas`
  );
  assert.match(routeMap, /<GooglePlacesMap/);
  assert.match(routeMap, /segments=\{segments\}/);
  assert.match(routeMap, /viewMode=\{viewMode\}/);
  assert.doesNotMatch(
    routeMap,
    /buildMapFeatureData|usePlaceSearch|AdvancedMarkerElement|maplibregl|async function submitSearch/
  );

  assert.match(googleMap, /buildMapFeatureData/);
  assert.match(googleMap, /usePlaceSearch/);
  assert.match(googleMap, /AdvancedMarkerElement/);
  assert.match(googleMap, /<PlaceSearchForm/);
  assert.doesNotMatch(googleMap, /maplibregl|createGeoapifyStyleUrl/);
  assert.match(model, /export function adaptiveCurve/);
  assert.match(search, /async function submitSearch/);
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

test('los clientes Geoapify comparten solo infraestructura Firebase', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const callableFacade = await read('src/modules/places/geoapifyCallable.js');
  const callableInfrastructure = await read('src/infrastructure/firebase/callableFunctions.js');
  const cache = await read('src/modules/places/geoapifyClientCache.js');
  const query = await read('src/modules/places/geoapifyQuery.js');
  const cityClient = await read('src/modules/geocoding/citySearchClient.js');

  assert.ok(
    lineCount(client) <= 90,
    `geoapifyClient.js volvió a crecer a ${lineCount(client)} líneas`
  );
  assert.match(client, /from '\.\/geoapifyCallable\.js'/);
  assert.match(client, /from '\.\/geoapifyClientCache\.js'/);
  assert.match(client, /from '\.\/geoapifyQuery\.js'/);
  assert.doesNotMatch(client, /connectFunctionsEmulator|localStorage|contextualQuery|searchContext|citySearchClient/);

  assert.match(callableFacade, /firebaseCallable as geoapifyCallable/);
  assert.match(callableInfrastructure, /connectFunctionsEmulator/);
  assert.match(callableInfrastructure, /httpsCallable/);
  assert.match(cityClient, /from '\.\.\/\.\.\/infrastructure\/firebase\/callableFunctions\.js'/);
  assert.doesNotMatch(cityClient, /modules\/places|geoapifyPlaceSearch/);
  assert.match(cache, /export function createPersistentCache/);
  assert.match(cache, /localStorage/);
  assert.match(query, /export function normalizeSearchKey/);
  assert.doesNotMatch(query, /contextualQuery|callableSearchContext|knownLocations/);
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
  assert.doesNotMatch(editor, /expenses__toggle|usesDetailedFood|foodSingle|foodDetailed/);
  assert.match(editor, /setExpenseItemsTotal\(expenses, 'attractions', value\)/);

  assert.doesNotMatch(operations, /from 'react'|@tabler\/icons-react/);
  assert.match(operations, /export function updateExpenseItem/);
  assert.match(operations, /export function setExpenseItemsTotal/);
  assert.match(catalog, /export const EXPENSE_ICONS/);
  assert.match(catalog, /export function transportOtherIcon/);
  assert.match(fixedCards, /className="expenses__fixed-list"/);
  assert.match(lineItems, /moneycard moneycard--lineitem/);
  assert.match(lineItems, /safeItems\.map[\s\S]*expenses__add-other/);
});
