import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createExpenses,
  expensesTotal,
} from '../src/modules/expenses/expenseModel.js';
import {
  createTrip,
  normalizeTrip,
  tripTotal,
} from '../src/modules/trips/tripModel.js';
import {
  v4TripCreateDocument,
  v4TripMetadataPatch,
} from '../src/infrastructure/firebase/v4TripDocument.js';

function originExpenses() {
  const expenses = createExpenses();
  expenses.lodging = 120;
  expenses.food.single = 30;
  expenses.transport.plane = 200;
  return expenses;
}

test('originDetails se normaliza dentro del viaje y participa en el total', () => {
  const raw = createTrip('Europa');
  raw.originDetails = {
    departureDate: '2026-12-01',
    expenses: originExpenses(),
    note: 'Llegar temprano a la estación',
  };
  raw.segments = [{
    id: 'segment-1',
    origin: null,
    destination: null,
    startDate: '',
    endDate: '',
    expenses: { ...createExpenses(), lodging: 50 },
    note: '',
  }];

  const normalized = normalizeTrip(raw);
  assert.equal(normalized.originDetails.departureDate, '2026-12-01');
  assert.equal(normalized.originDetails.note, 'Llegar temprano a la estación');
  assert.equal(
    tripTotal(normalized),
    expensesTotal(normalized.originDetails.expenses) + expensesTotal(normalized.segments[0].expenses)
  );
});

test('originDetails limita la nota canónica a 500 caracteres', () => {
  const raw = createTrip('Europa');
  raw.originDetails = {
    departureDate: '',
    expenses: originExpenses(),
    note: 'x'.repeat(650),
  };

  const normalized = normalizeTrip(raw);
  assert.equal(normalized.originDetails.note.length, 500);
});

test('documento root v4 crea y actualiza originDetails sin permitir total cliente', () => {
  const trip = createTrip('Europa');
  trip.id = 'trip-1';
  trip.originDetails = {
    departureDate: '2026-12-01',
    expenses: originExpenses(),
    note: 'Nota del origen',
  };
  const timestamp = { server: true };

  const created = v4TripCreateDocument(trip, timestamp);
  assert.equal(created.originDetails.departureDate, '2026-12-01');
  assert.equal(created.originDetails.note, 'Nota del origen');
  assert.equal(created.total, 0);

  const patch = v4TripMetadataPatch(trip, 3, timestamp);
  assert.equal(patch.originDetails.expenses.lodging, 120);
  assert.equal(patch.originDetails.note, 'Nota del origen');
  assert.equal(patch.version, 4);
  assert.equal(Object.hasOwn(patch, 'total'), false);
});

test('rules y writers conservan originDetails en el camino v4 canónico', async () => {
  const [rules, editorWriter, writer] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../src/infrastructure/firebase/firestoreV4EditorTripWriter.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/infrastructure/firebase/firestoreV4PilotTripWriter.js', import.meta.url), 'utf8'),
  ]);

  assert.match(rules, /function validOriginDetails\(data\)/);
  assert.match(rules, /hasOnly\(\['departureDate', 'expenses', 'note'\]\)/);
  assert.match(rules, /data\.note\.size\(\) <= 500/);
  assert.match(rules, /validExpenses\(data\.expenses\)/);
  assert.match(rules, /'name', 'currency', 'origin', 'originDetails', 'version', 'updatedAt'/);
  assert.match(editorWriter, /originDetails: remoteRoot\.originDetails/);
  assert.match(writer, /originDetails: remoteRoot\.originDetails/);
});
