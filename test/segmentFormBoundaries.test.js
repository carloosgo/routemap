import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const lineCount = (content) => content.split('\n').length;

test('SegmentForm coordina filas compactas y el header global posee la edición temporal', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const originSection = await read('src/modules/trips/SegmentOriginSection.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');
  const body = await read('src/modules/trips/SegmentBody.jsx');
  const originBody = await read('src/modules/trips/OriginBody.jsx');
  const tripHeader = await read('src/app/TripSummaryHeader.jsx');
  const calendar = await read('src/components/CalendarDateInput.jsx');
  const dialog = await read('src/modules/trips/SegmentDeleteDialog.jsx');
  const model = await read('src/modules/trips/segmentFormModel.js');
  const dateRules = await read('src/modules/trips/tripDateRules.js');

  assert.ok(lineCount(form) <= 130, `SegmentForm.jsx volvió a crecer a ${lineCount(form)} líneas`);
  assert.match(form, /<SegmentOriginSection/);
  assert.match(form, /<SegmentHeader/);
  assert.match(form, /currency=\{currency\}/);
  assert.match(form, /onDestinationSelect=\{\(destination\) => onUpdate\(\{ destination \}\)\}/);
  assert.match(form, /<SegmentDeleteDialog/);
  assert.match(form, /onOpenDetails=\{openSegmentDetails\}/);
  assert.match(form, /formatSegmentAmount\(segmentTotal\(segment\), locale, currency\)/);
  assert.doesNotMatch(form, /formatSegmentDate|formatSegmentNights|formatSegmentDates|formattedStartDate|formattedEndDate|formattedNights|formattedDates|<SegmentBody|CollapsibleRegion|expanded=|onToggle=|CityAutocomplete|CalendarDateInput|ExpenseEditor|ConfirmDialog|IconChevronDown|<ItineraryOrigin|<OriginBody|useExpandedSegmentReveal|scrollIntoView/);

  assert.match(originSection, /<ItineraryOrigin/);
  assert.match(originSection, /onSelect=\{onUpdateOrigin\}/);
  assert.match(originSection, /onClear=\{\(\) => onUpdateOrigin\(null\)\}/);
  assert.match(originSection, /onOpenDetails=\{onOpenDetails\}/);
  assert.match(originSection, /originDetails/);
  assert.match(originSection, /formatSegmentAmount\([\s\S]*locale,[\s\S]*currency/);
  assert.match(originSection, /formatSegmentDate\(\s*originDetails\?\.departureDate,\s*locale\s*\)/);
  assert.match(originSection, /formattedDepartureDate=\{formattedDepartureDate\}/);
  assert.doesNotMatch(originSection, /formatSegmentNights|formattedStartDate|formattedEndDate|<OriginBody|CollapsibleRegion|useState/);

  assert.doesNotMatch(origin, /itinerary-start-flag\.svg/);
  assert.match(origin, /CityAutocomplete/);
  assert.match(origin, /value=\{city\}/);
  assert.match(origin, /segment__toggle segment__details-btn itinerary-origin__details-btn/);
  assert.doesNotMatch(origin, /itinerary-stop__dates|itinerary-stop__nights|segment__pill/);
  assert.match(origin, /itinerary-stop__date-range/);
  assert.match(origin, /\{formattedDepartureDate \|\| ''\}/);
  assert.doesNotMatch(origin, /formattedEndDate|endDate/);
  assert.match(origin, /itinerary-stop__amount/);
  assert.match(header, /segment__header itinerary-stop/);
  assert.match(header, /CityAutocomplete/);
  assert.match(header, /value=\{destination\}/);
  assert.match(header, /onSelect=\{onDestinationSelect\}/);
  assert.match(header, /segment__toggle segment__details-btn itinerary-stop__details-btn/);
  assert.doesNotMatch(header, /itinerary-stop__dates|itinerary-stop__nights|segment__pill|aria-controls|aria-expanded/);
  assert.match(header, /itinerary-stop__date-range/);
  assert.match(header, /itinerary-stop__amount/);

  assert.match(modal, /<SegmentBody/);
  assert.match(modal, /<OriginBody/);
  assert.match(modal, /className="segnote segment-details-modal"/);
  assert.match(modal, /validateOriginDepartureDateChange/);
  assert.match(modal, /validateSegmentDatePatch/);
  assert.match(modal, /setDateError\(t\(validation\.errorKey\)\)/);

  assert.match(body, /className="segment__body segment-expense-form"/);
  assert.doesNotMatch(body, /CityAutocomplete|segment-route-editor|CalendarDateInput|segment-details-modal__date-error/);
  assert.match(body, /<ExpenseEditor/);
  assert.match(originBody, /<ExpenseEditor/);

  assert.match(tripHeader, /className="trip-summary__metric--dates"/);
  assert.match(tripHeader, /<CalendarDateInput[\s\S]*value=\{trip\.startDate \|\| ''\}[\s\S]*max=\{trip\.endDate \|\| undefined\}/);
  assert.match(tripHeader, /<CalendarDateInput[\s\S]*value=\{trip\.endDate \|\| ''\}[\s\S]*min=\{trip\.startDate \|\| undefined\}/);
  assert.match(tripHeader, /updateTripDates\?\.\(\{ startDate \}\)/);
  assert.match(tripHeader, /updateTripDates\?\.\(\{ endDate \}\)/);

  assert.match(calendar, /const maxDate = useMemo/);
  assert.match(calendar, /disabled=\{nextDisabled\}/);
  assert.match(calendar, /maxDate && startOfDay\(date\) > startOfDay\(maxDate\)/);
  assert.match(dialog, /<ConfirmDialog/);
  assert.match(model, /export function isValidSegmentDateRange/);
  assert.doesNotMatch(model, /from 'react'|\.jsx/);
  assert.match(dateRules, /export function validateOriginDepartureDateChange/);
  assert.match(dateRules, /export function validateSegmentDatePatch/);
});
