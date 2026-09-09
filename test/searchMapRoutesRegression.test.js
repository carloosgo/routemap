// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TRIP_DATE_ERRORS,
  validateSegmentDatePatch,
} from '../src/modules/trips/tripDateRules.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function tripWithPendingPlace() {
  return {
    segments: [{
      id: 'madrid',
      startDate: '',
      endDate: '',
      destination: { name: 'Madrid', countryCode: 'ES' },
      expenses: {},
    }],
    places: [{
      id: 'prado',
      segmentId: 'madrid',
      dayOffset: 3,
    }],
  };
}

test('un lugar puede esperar en una ciudad sin rango completo de fechas', () => {
  const trip = tripWithPendingPlace();

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'madrid', { startDate: '2026-10-01' }),
    { valid: true, errorKey: '' }
  );
  assert.deepEqual(
    validateSegmentDatePatch(trip, 'madrid', { endDate: '2026-10-04' }),
    { valid: true, errorKey: '' }
  );
});

test('assignedPlacesOutOfRange sólo aparece cuando un rango completo excluye un día ya asignado', () => {
  const trip = tripWithPendingPlace();

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'madrid', {
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    }),
    { valid: false, errorKey: TRIP_DATE_ERRORS.assignedPlacesOutOfRange }
  );
  assert.deepEqual(
    validateSegmentDatePatch(trip, 'madrid', {
      startDate: '2026-10-01',
      endDate: '2026-10-04',
    }),
    { valid: true, errorKey: '' }
  );
});

test('el modal de detalles titula la ciudad destino sin reconstruir Origen → destino', async () => {
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');

  assert.match(modal, /const destinationName = String\(segment\?\.destination\?\.name \|\| ''\)\.trim\(\)/);
  assert.match(modal, /\{destinationName \|\| '—'\}/);
  assert.doesNotMatch(modal, /originName[\s\S]*destinationName/);
  assert.doesNotMatch(modal, /IconArrowRight/);
});

test('ocultar Lugares sólo oculta pines guardados y no la geometría de rutas', async () => {
  const pane = await read('src/app/AppMapPane.jsx');
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const polish = await read('src/modules/map/UnifiedSearchPolish.css');

  assert.match(pane, /data-saved-places-visible=\{unifiedRoutesView && showSavedPlaces \? 'true' : 'false'\}/);
  assert.match(routeMap, /showSavedRoutes=\{viewMode === 'places'\}/);
  assert.match(polish, /data-saved-places-visible="false"\][\s\S]*\.google-saved-place-marker/);
  assert.doesNotMatch(routeMap, /showSavedRoutes=\{showSavedPlaces\}/);
});
