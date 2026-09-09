// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('header date dialog lets CalendarDateInput popovers escape without changing cost breakdown clipping', () => {
  const baseCss = source('src/app/TripSummaryHeader.css');
  const polishCss = source('src/app/TripSummaryHeaderMicroPolish.css');
  const header = source('src/app/TripSummaryHeader.jsx');

  assert.match(baseCss, /\.trip-summary__breakdown\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(polishCss, /\.trip-summary__breakdown\[role='dialog'\]\s*\{\s*overflow:\s*visible;/);
  assert.match(polishCss, /\.trip-summary__breakdown\[role='dialog'\]\s+\.calendar-date__popover\s*\{[\s\S]*?z-index:\s*1200;/);
  assert.match(header, /className="trip-summary__breakdown"\s+role="dialog"\s+aria-label=\{t\('tripDates'\)\}/);
  assert.match(header, /className="trip-summary__breakdown"\s+role="region"\s+aria-label=\{t\('grandTotal'\)\}/);
});

test('My Routes timeline connects only consecutive place nodes and crosses the route card', () => {
  const css = source('src/app/UnifiedMyRoutesInteraction.css');
  const connections = source('src/modules/places/TripRouteConnections.jsx');

  assert.match(css, /\.trip-places--unified \.trip-day__rail\s*\{\s*display:\s*none;/);
  assert.match(css, /\.trip-place-block:not\(:first-child\) \.trip-place::before/);
  assert.match(css, /\.trip-place-block:not\(:last-child\) \.trip-place::after/);
  assert.match(css, /\.trip-place-block:not\(:first-child\) \.trip-place::before\s*\{[\s\S]*?top:\s*0;[\s\S]*?height:\s*50%;/);
  assert.match(css, /\.trip-place-block:not\(:last-child\) \.trip-place::after\s*\{[\s\S]*?top:\s*50%;[\s\S]*?bottom:\s*0;/);
  assert.match(css, /\.trip-day \.trip-connection__rail\s*\{[\s\S]*?top:\s*0;[\s\S]*?bottom:\s*0;[\s\S]*?display:\s*block;/);
  assert.ok((css.match(/border-left:\s*2px dotted var\(--trip-day-color\)/g) || []).length >= 2);
  assert.match(connections, /className="trip-connection__rail"/);
});
