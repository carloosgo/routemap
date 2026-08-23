import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const lineCount = (content) => content.split('\n').length;

test('SegmentForm coordina filas compactas con fecha visible y el modal posee la edición detallada', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const originSection = await read('src/modules/trips/SegmentOriginSection.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');
  const body = await read('src/modules/trips/SegmentBody.jsx');
  const originBody = await read('src/modules/trips/OriginBody.jsx');
  const calendar = await read('src/components/CalendarDateInput.jsx');
  const dialog = await read('src/modules/trips/SegmentDeleteDialog.jsx');
  const model = await read('src/modules/trips/segmentFormModel.js');

  assert.ok(lineCount(form) <= 130, `SegmentForm.jsx volvió a crecer a ${lineCount(form)} líneas`);
  assert.match(form, /<SegmentOriginSection/);
  assert.match(form, /<SegmentHeader/);
  assert.match(form, /currency=\{currency\}/);
  assert.match(form, /onDestinationSelect=\{\(destination\) => onUpdate\(\{ destination \}\)\}/);
  assert.match(form, /<SegmentDeleteDialog/);
  assert.match(form, /onOpenDetails=\{openSegmentDetails\}/);
  assert.match(form, /formatSegmentAmount\(segmentTotal\(segment\), locale, currency\)/);
  assert.match(form, /formatSegmentDate\(segment\.startDate, locale\)/);
  assert.match(form, /formatSegmentDate\(segment\.endDate, locale\)/);
  assert.match(form, /formattedStartDate=\{formattedStartDate\}/);
  assert.match(form, /formattedEndDate=\{formattedEndDate\}/);
  assert.doesNotMatch(form, /formatSegmentNights|formatSegmentDates|formattedNights|formattedDates|<SegmentBody|CollapsibleRegion|expanded=|onToggle=|CityAutocomplete|CalendarDateInput|ExpenseEditor|ConfirmDialog|IconChevronDown|<ItineraryOrigin|<OriginBody|useExpandedSegmentReveal|scrollIntoView/);

  assert.match(originSection, /<ItineraryOrigin/);
  assert.match(originSection, /onSelect=\{\(origin\) => onUpdate\(\{ origin \}\)\}/);
  assert.match(originSection, /onOpenDetails=\{onOpenDetails\}/);
  assert.match(originSection, /originDetails/);
  assert.match(originSection, /formatSegmentAmount\([\s\S]*locale,[\s\S]*currency/);
  assert.match(originSection, /formatSegmentDate\(originDetails\?\.departureDate, locale\)/);
  assert.match(originSection, /formattedEndDate = '—'/);
  assert.doesNotMatch(originSection, /formatSegmentNights|<OriginBody|CollapsibleRegion|useState/);

  assert.doesNotMatch(origin, /itinerary-start-flag\.svg/);
  assert.match(origin, /CityAutocomplete/);
  assert.match(origin, /value=\{city\}/);
  assert.match(origin, /segment__toggle segment__details-btn itinerary-origin__details-btn/);
  assert.match(origin, /itinerary-stop__dates/);
  assert.doesNotMatch(origin, /itinerary-stop__nights|segment__pill/);
  assert.match(header, /segment__header itinerary-stop/);
  assert.match(header, /CityAutocomplete/);
  assert.match(header, /value=\{destination\}/);
  assert.match(header, /onSelect=\{onDestinationSelect\}/);
  assert.match(header, /segment__toggle segment__details-btn itinerary-stop__details-btn/);
  assert.match(header, /itinerary-stop__dates/);
  assert.doesNotMatch(header, /itinerary-stop__nights|segment__pill|aria-controls|aria-expanded/);

  assert.match(modal, /<SegmentBody/);
  assert.match(modal, /<OriginBody/);
  assert.match(modal, /className="segnote segment-details-modal"/);
  assert.match(body, /className="segment__body segment-expense-form"/);
  assert.doesNotMatch(body, /CityAutocomplete|segment-route-editor/);
  assert.match(body, /CalendarDateInput/);
  assert.match(body, /max=\{segment\.endDate \|\| undefined\}/);
  assert.match(body, /min=\{segment\.startDate \|\| undefined\}/);
  assert.match(body, /isValidSegmentDateRange/);
  assert.match(body, /<ExpenseEditor/);
  assert.match(originBody, /<ExpenseEditor/);
  assert.doesNotMatch(body, /dates__label|dates__arrow/);

  assert.match(calendar, /const maxDate = useMemo/);
  assert.match(calendar, /disabled=\{nextDisabled\}/);
  assert.match(calendar, /maxDate && startOfDay\(date\) > startOfDay\(maxDate\)/);
  assert.match(dialog, /<ConfirmDialog/);
  assert.match(model, /export function isValidSegmentDateRange/);
  assert.doesNotMatch(model, /from 'react'|\.jsx/);
});
