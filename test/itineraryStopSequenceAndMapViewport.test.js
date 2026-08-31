// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildItineraryStopSequence } from '../src/modules/trips/itineraryStopSequence.js';
import {
  buildMapFeatureData,
  itineraryViewportKey,
} from '../src/modules/map/routeMapModel.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const origin = {
  id: 'origin', name: 'Mexico City', country: 'Mexico', countryCode: 'MX', lat: 19.4326, lon: -99.1332,
};
const madrid = {
  id: 'madrid', name: 'Madrid', country: 'Spain', countryCode: 'ES', lat: 40.4168, lon: -3.7038,
};
const paris = {
  id: 'paris', name: 'Paris', country: 'France', countryCode: 'FR', lat: 48.8566, lon: 2.3522,
};

const colors = ['#111111', '#222222', '#333333', '#444444'];
const colorForIndex = (index) => colors[index] || '#999999';

function roundTripSegments() {
  return [
    { id: 'one', origin, destination: madrid, expenses: { transport: {} } },
    { id: 'two', origin: madrid, destination: paris, expenses: { transport: {} } },
    { id: 'three', origin: paris, destination: origin, expenses: { transport: {} } },
  ];
}

test('origin is unnumbered, first destination is 1 and a terminal return to origin is unnumbered', () => {
  const sequence = buildItineraryStopSequence(roundTripSegments(), colorForIndex);

  assert.deepEqual(
    sequence.map(({ number, color, isTerminalReturn }) => ({ number, color, isTerminalReturn })),
    [
      { number: 1, color: '#111111', isTerminalReturn: false },
      { number: 2, color: '#222222', isTerminalReturn: false },
      { number: null, color: null, isTerminalReturn: true },
    ]
  );
});

test('three or more consecutive cities in one country keep endpoint flags and mark only interior cities as dots', () => {
  const venice = { id: 'venice', name: 'Venice', country: 'Italy', countryCode: 'IT' };
  const milan = { id: 'milan', name: 'Milan', country: 'Italy', countryCode: 'IT' };
  const florence = { id: 'florence', name: 'Florence', country: 'Italy', countryCode: 'IT' };
  const rome = { id: 'rome', name: 'Rome', country: 'Italy', countryCode: 'IT' };
  const sequence = buildItineraryStopSequence([
    { id: 'it-one', origin: venice, destination: milan },
    { id: 'it-two', origin: milan, destination: florence },
    { id: 'it-three', origin: florence, destination: rome },
  ], colorForIndex);

  assert.deepEqual(
    sequence.map(({ countryRunPosition, joinsPreviousCountryRun }) => ({
      countryRunPosition,
      joinsPreviousCountryRun,
    })),
    [
      { countryRunPosition: 'middle', joinsPreviousCountryRun: true },
      { countryRunPosition: 'middle', joinsPreviousCountryRun: true },
      { countryRunPosition: 'end', joinsPreviousCountryRun: true },
    ]
  );
});

test('same-country grouping starts and ends at country boundaries and does not activate for only two cities', () => {
  const venice = { id: 'venice', name: 'Venice', country: 'Italy', countryCode: 'IT' };
  const milan = { id: 'milan', name: 'Milan', country: 'Italy', countryCode: 'IT' };
  const parisFr = { id: 'paris-fr', name: 'Paris', country: 'France', countryCode: 'FR' };
  const lyon = { id: 'lyon', name: 'Lyon', country: 'France', countryCode: 'FR' };
  const nice = { id: 'nice', name: 'Nice', country: 'France', countryCode: 'FR' };
  const sequence = buildItineraryStopSequence([
    { id: 'one', origin: venice, destination: milan },
    { id: 'two', origin: milan, destination: parisFr },
    { id: 'three', origin: parisFr, destination: lyon },
    { id: 'four', origin: lyon, destination: nice },
  ], colorForIndex);

  assert.deepEqual(
    sequence.map(({ countryRunPosition, joinsPreviousCountryRun }) => ({
      countryRunPosition,
      joinsPreviousCountryRun,
    })),
    [
      { countryRunPosition: null, joinsPreviousCountryRun: false },
      { countryRunPosition: 'start', joinsPreviousCountryRun: false },
      { countryRunPosition: 'middle', joinsPreviousCountryRun: true },
      { countryRunPosition: 'end', joinsPreviousCountryRun: true },
    ]
  );
});

test('map feature projection reuses canonical numbers and marks a terminal return on the existing origin feature', () => {
  const data = buildMapFeatureData({
    segments: roundTripSegments(),
    places: [],
    viewMode: 'segments',
    colorForIndex,
  });

  assert.equal(data.cityFeatures.length, 3);
  assert.deepEqual(
    data.cityFeatures.map((feature) => ({
      role: feature.properties.role,
      sequence: feature.properties.sequence,
      color: feature.properties.color,
      name: feature.properties.name,
      visits: feature.properties.visits,
      isFinish: feature.properties.isFinish,
    })),
    [
      { role: 'origin', sequence: null, color: null, name: 'Mexico City', visits: [], isFinish: true },
      { role: 'destination', sequence: 1, color: '#111111', name: 'Madrid', visits: [{ sequence: 1, color: '#111111' }], isFinish: false },
      { role: 'destination', sequence: 2, color: '#222222', name: 'Paris', visits: [{ sequence: 2, color: '#222222' }], isFinish: false },
    ]
  );
});

test('repeated destinations share one geographic feature with every visit number side by side', () => {
  const rome = {
    id: 'rome', name: 'Rome', country: 'Italy', countryCode: 'IT', lat: 41.9028, lon: 12.4964,
  };
  const segments = [
    { id: 'one', origin, destination: paris, expenses: { transport: {} } },
    { id: 'two', origin: paris, destination: rome, expenses: { transport: {} } },
    { id: 'three', origin: rome, destination: paris, expenses: { transport: {} } },
  ];
  const data = buildMapFeatureData({
    segments,
    places: [],
    viewMode: 'segments',
    colorForIndex,
  });
  const parisFeatures = data.cityFeatures.filter(
    (feature) => feature.properties.name === 'Paris'
  );

  assert.equal(parisFeatures.length, 1);
  assert.deepEqual(parisFeatures[0].properties.visits, [
    { sequence: 1, color: '#111111' },
    { sequence: 3, color: '#333333' },
  ]);
  assert.equal(parisFeatures[0].properties.isFinish, true);
});

test('reordering the same geographic stops does not change the itinerary viewport identity', () => {
  const original = roundTripSegments();
  const reordered = [
    { ...original[1], origin },
    { ...original[0], origin: paris },
    { ...original[2], origin: madrid },
  ];

  assert.equal(itineraryViewportKey(original), itineraryViewportKey(reordered));
});

test('UI consumes canonical numbering, repeated visit dots and finish flag assets', async () => {
  const editor = await read('src/app/AppEditorPane.jsx');
  const mapPane = await read('src/app/AppMapPane.jsx');
  const segmentHeader = await read('src/modules/trips/SegmentHeader.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const headerType = await read('src/app/TripSummaryHeaderTypography.css');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const markerCss = await read('src/modules/map/ItineraryNumberMarkers.css');
  const routeMap = await read('src/modules/map/RouteMap.jsx');

  assert.match(editor, /buildItineraryStopSequence\(trip\.segments, colorForIndex\)/);
  assert.match(editor, /sequenceNumber=\{stopSequence\[index\]\?\.number \?\? null\}/);
  assert.match(editor, /countryRunPosition=\{stopSequence\[index\]\?\.countryRunPosition \|\| null\}/);
  assert.match(editor, /joinsPreviousCountryRun=\{Boolean\(stopSequence\[index\]\?\.joinsPreviousCountryRun\)\}/);
  assert.match(mapPane, /buildItineraryStopSequence\(trip\.segments, colorForIndex\)/);
  assert.match(mapPane, /\{stop\.number\}/);
  assert.match(segmentHeader, /className="itinerary-stop__sequence-badge"/);
  assert.match(segmentHeader, /countryRunPosition === 'middle'/);
  assert.match(segmentHeader, /className="itinerary-stop__country-run-dot"/);
  assert.match(compact, /--itinerary-compact-gap:\s*10px;/);
  assert.match(compact, /--itinerary-city-width:\s*calc\(\(var\(--workspace-panel-width\) - 147px\) \/ 3\);/);
  assert.match(compact, /grid-template-columns:[\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*var\(--country-run-track-w, 30px\)[\s\S]*var\(--itinerary-city-width\)[\s\S]*minmax\(0, 1fr\);/s);
  assert.match(headerType, /\.trip-summary__metric-label\s*\{[^}]*color:\s*#0d6078;/s);
  assert.match(headerType, /\.trip-summary__metric-value,[\s\S]*color:\s*#000000;/);
  assert.match(googleMap, /const isOrigin = feature\.properties\?\.role === 'origin';/);
  assert.match(googleMap, /feature\.properties\?\.isFinish/);
  assert.match(googleMap, /google-itinerary-city-marker__dot/);
  assert.match(googleMap, /itineraryFlag\('finish'\)/);
  assert.match(googleMap, /routeCities\.map\(cityKey\)\.sort\(\)\.join\('\|'\)/);
  assert.match(markerCss, /background:\s*var\(--itinerary-visit-color, var\(--itinerary-city-color, #111111\)\);/);
  assert.match(markerCss, /display:\s*inline-flex;/);
  assert.match(markerCss, /gap:\s*2px;/);
  assert.match(markerCss, /itinerary-finish-flag\.svg/);
  assert.match(routeMap, /GooglePlacesMap\.css';\s*\nimport '\.\/ItineraryNumberMarkers\.css';/);
});
