// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('only the six header summary cards grow while expense concepts keep their previous scale and origin keeps its original hierarchy', async () => {
  const header = await read('src/app/TripSummaryHeaderTypography.css');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');

  assert.match(header, /\.trip-summary__metric-label\s*\{[^}]*font-size:\s*14px;/s);
  assert.match(header, /\.trip-summary__metric-value,[\s\S]*font-size:\s*18px;/);
  assert.doesNotMatch(header, /trip-summary__title/);

  assert.match(
    correction,
    /itinerary-origin__picker \.autocomplete__selected-value[\s\S]*color:\s*#5f6875;[\s\S]*font-size:\s*12\.5px;[\s\S]*font-weight:\s*500;/
  );
  assert.match(
    correction,
    /itinerary-origin__country[\s\S]*font-size:\s*10\.5px;[\s\S]*font-weight:\s*400;/
  );
  assert.match(correction, /moneycard__label,[\s\S]*font-size:\s*13px;/);
  assert.match(correction, /moneycard__input,[\s\S]*font-size:\s*12px;/);
  assert.match(correction, /moneycard__currency,[\s\S]*font-size:\s*11px;/);
  assert.match(correction, /expenses__add-other\s*\{[^}]*font-size:\s*13px;/s);
});

test('origin note and segment notes resolve explicit targets before reaching shared note state', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const origin = await read('src/modules/trips/SegmentOriginSection.jsx');
  const body = await read('src/modules/trips/OriginBody.jsx');
  const map = await read('src/app/AppMapPane.jsx');
  const app = await read('src/App.jsx');

  assert.match(form, /ORIGIN_NOTE_TARGET/);
  assert.match(form, /const openSegmentNote = \(\) => onOpenNote\(segment\.id\);/);
  assert.match(form, /const openOriginNote = \(\) => onOpenNote\(ORIGIN_NOTE_TARGET\);/);
  assert.match(form, /onOpenNote=\{openOriginNote\}/);
  assert.match(form, /onOpenNote=\{openSegmentNote\}/);
  assert.match(origin, /onOpenNote=\{onOpenNote\}/);
  assert.doesNotMatch(body, /itinerary-origin__note-editor|<textarea/);

  assert.match(map, /openNoteSegmentId === ORIGIN_NOTE_TARGET/);
  assert.equal((map.match(/className="segnote"/g) || []).length, 2);
  assert.equal((map.match(/className="segnote__textarea"/g) || []).length, 2);
  assert.match(map, /updateOriginDetails\(\{ note: event\.target\.value \}\)/);
  assert.match(map, /updateSegment\(segment\.id, \{ note: event\.target\.value \}\)/);
  assert.match(map, /data-persistence-state=\{persistenceState\}/);
  assert.match(app, /updateOriginDetails=\{updateOriginDetails\}/);
});

test('itinerary reserves the vertical scrollbar gutter so expanding a segment does not shift rows sideways', async () => {
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');

  assert.match(
    correction,
    /\.editor-module--itinerary \.editor__body\s*\{[^}]*scrollbar-gutter:\s*stable;/s
  );
});
