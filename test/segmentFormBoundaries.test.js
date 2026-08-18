import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const lineCount = (content) => content.split('\n').length;

test('SegmentForm coordina el timeline sin absorber edición, encabezado ni diálogo', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const body = await read('src/modules/trips/SegmentBody.jsx');
  const dialog = await read('src/modules/trips/SegmentDeleteDialog.jsx');
  const model = await read('src/modules/trips/segmentFormModel.js');

  assert.ok(
    lineCount(form) <= 130,
    `SegmentForm.jsx volvió a crecer a ${lineCount(form)} líneas`
  );
  assert.match(form, /<ItineraryOrigin/);
  assert.match(form, /<SegmentHeader/);
  assert.match(form, /<SegmentBody/);
  assert.match(form, /<SegmentDeleteDialog/);
  assert.match(form, /formatSegmentAmount/);
  assert.match(form, /formatSegmentDates/);
  assert.match(form, /formatSegmentNights/);
  assert.doesNotMatch(
    form,
    /CityAutocomplete|CalendarDateInput|ExpenseEditor|ConfirmDialog|IconChevronDown/
  );

  assert.match(origin, /itinerary-start-flag\.svg/);
  assert.match(origin, /t\('origin'\)/);
  assert.match(header, /segment__header itinerary-stop/);
  assert.doesNotMatch(header, /CityAutocomplete/);
  assert.match(header, /aria-controls=\{bodyId\}/);
  assert.match(body, /className="segment__body"/);
  assert.match(body, /CityAutocomplete/);
  assert.match(body, /onUpdate\(\{ origin \}\)/);
  assert.match(body, /onUpdate\(\{ destination \}\)/);
  assert.match(body, /CalendarDateInput/);
  assert.match(body, /<ExpenseEditor/);
  assert.match(dialog, /<ConfirmDialog/);
  assert.doesNotMatch(model, /from 'react'|\.jsx/);
});
