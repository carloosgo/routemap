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

const colors = ['#111111', '#222222', '#333333'];
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

test('map feature projection reuses the same destination numbers and colors and omits terminal return marker', () => {
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
    })),
    [
      { role: 'origin', sequence: null, color: null, name: 'Mexico City' },
      { role: 'destination', sequence: 1, color: '#111111', name: 'Madrid' },
      { role: 'destination', sequence: 2, color: '#222222', name: 'Paris' },
    ]
  );
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

test('UI consumes canonical numbering while preserving gray labels and colored map circles', async () => {
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
  assert.match(mapPane, /buildItineraryStopSequence\(trip\.segments, colorForIndex\)/);
  assert.match(mapPane, /\{stop\.number\}/);
  assert.match(segmentHeader, /className="itinerary-stop__sequence-badge"/);
  assert.match(compact, /--itinerary-compact-gap:\s*10px;/);
  assert.match(compact, /grid-template-columns:\s*14px 19px 30px 126px minmax\(0, 1fr\);/);
  assert.match(headerType, /\.trip-summary__metric-label\s*\{[^}]*color:\s*var\(--text-mute\);/s);
  assert.match(headerType, /\.trip-summary__metric-value,[\s\S]*color:\s*#000000;/);
  assert.match(googleMap, /const isOrigin = feature\.properties\?\.role === 'origin';/);
  assert.match(googleMap, /routeCities\.map\(cityKey\)\.sort\(\)\.join\('\|'\)/);
  assert.match(markerCss, /background:\s*var\(--itinerary-city-color, #111111\);/);
  assert.match(markerCss, /\.google-itinerary-city-marker\.is-origin/);
  assert.match(routeMap, /GooglePlacesMap\.css';\s*\nimport '\.\/ItineraryNumberMarkers\.css';/);
});
