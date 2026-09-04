// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tripCountryCount, tripSummary } from '../src/modules/trips/tripSummaryModel.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('trip summary counts unique visited countries while excluding the origin country', () => {
  const segments = [
    {
      origin: { name: 'Mexico City', country: 'Mexico', countryCode: 'MX' },
      destination: { name: 'Madrid', country: 'Spain', countryCode: 'ES' },
    },
    {
      origin: { name: 'Madrid', country: 'Spain', countryCode: 'ES' },
      destination: { name: 'Barcelona', country: 'Spain', countryCode: 'ES' },
    },
    {
      origin: { name: 'Barcelona', country: 'Spain', countryCode: 'ES' },
      destination: { name: 'Paris', country: 'France', countryCode: 'FR' },
    },
    {
      origin: { name: 'Paris', country: 'France', countryCode: 'FR' },
      destination: { name: 'Mexico City', country: 'Mexico', countryCode: 'MX' },
    },
  ];

  assert.equal(tripCountryCount(segments), 2);
  assert.equal(tripSummary({ segments }).countries, 2);
});

test('country count falls back to normalized country name and still excludes origin country', () => {
  const segments = [
    {
      origin: { name: 'City A', country: 'Portugal' },
      destination: { name: 'City B', country: ' portugal ' },
    },
    {
      origin: { name: 'City B', country: 'PORTUGAL' },
      destination: { name: 'City C', country: 'Italy' },
    },
  ];

  assert.equal(tripCountryCount(segments), 1);
});

test('note indicator overlays the upper-left stroke of the note icon and is slightly larger', async () => {
  const segmentHeader = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');

  for (const source of [segmentHeader, origin]) {
    assert.match(source, /top:\s*'3px'/);
    assert.match(source, /left:\s*'-1px'/);
    assert.match(source, /width:\s*'5px'/);
    assert.match(source, /height:\s*'5px'/);
    assert.doesNotMatch(source, /left:\s*'-2px'/);
  }
});

test('city metric uses country count as its secondary line in both locales', async () => {
  const header = await read('src/app/TripSummaryHeader.jsx');
  const en = await read('src/i18n/en.js');
  const es = await read('src/i18n/es.js');

  assert.match(header, /const countryLabel = `\$\{summary\.countries\} \$\{t\(summary\.countries === 1 \? 'country' : 'countries'\)\}`;/);
  assert.match(header, /label=\{countryLabel\}[\s\S]*value=\{`\$\{summary\.destinations\} \$\{t\('cities'\)\}`\}/);
  assert.match(en, /country:\s*'country'/);
  assert.match(en, /countries:\s*'countries'/);
  assert.match(es, /country:\s*'país'/);
  assert.match(es, /countries:\s*'países'/);
});
