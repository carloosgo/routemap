// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPublicDayShareModel,
  dayGoogleMapsLinks,
  decodePolyline,
  encodePolyline,
} from '../src/modules/share/dayRouteShare.js';

const place = (id, extra = {}) => ({ id, name: `P${id}`, city: 'Kioto', lat: 35 + Number(id) / 100, lon: 135.7, ...extra });

test('encodePolyline matches Google reference example and round-trips', () => {
  const points = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
  const encoded = encodePolyline(points);
  assert.equal(encoded, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(decodePolyline(encoded), points);
});

test('a day with several places links to Google Maps directions in order', () => {
  const places = [place(1, { googlePlaceId: 'g1' }), place(2), place(3, { googlePlaceId: 'g3' })];
  const routes = new Map([['1-2', { mode: 'walk' }], ['2-3', { mode: 'walk' }]]);
  const [link] = dayGoogleMapsLinks(places, (a, b) => routes.get(`${a.id}-${b.id}`));
  const url = new URL(link);
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(url.searchParams.get('origin'), 'P1, Kioto');
  assert.equal(url.searchParams.get('origin_place_id'), 'g1');
  assert.equal(url.searchParams.get('waypoints'), '35.020000,135.700000');
  assert.equal(url.searchParams.get('destination_place_id'), 'g3');
  assert.equal(url.searchParams.get('travelmode'), 'walking');
});

test('mixed modes or transit with stops leave the travel mode to Google', () => {
  const places = [place(1), place(2), place(3)];
  const mixed = dayGoogleMapsLinks(places, (a) => ({ mode: a.id === 1 ? 'walk' : 'drive' }));
  assert.equal(new URL(mixed[0]).searchParams.get('travelmode'), null);
  const transit = dayGoogleMapsLinks(places, () => ({ mode: 'transit' }));
  assert.equal(new URL(transit[0]).searchParams.get('travelmode'), null);
  const pair = dayGoogleMapsLinks(places.slice(0, 2), () => ({ mode: 'transit' }));
  assert.equal(new URL(pair[0]).searchParams.get('travelmode'), 'transit');
});

test('long days are split into chained links', () => {
  const places = Array.from({ length: 14 }, (_, index) => place(index + 1));
  const links = dayGoogleMapsLinks(places, () => null);
  assert.equal(links.length, 2);
  assert.equal(new URL(links[1]).searchParams.get('origin'), new URL(links[0]).searchParams.get('destination'));
});

test('the public day copy keeps only what the shared page shows', () => {
  const places = [
    place(1, { address: 'Calle 1', note: 'privada', segmentId: 's1', googlePlaceId: 'g1' }),
    place(2),
    place(3),
  ];
  const routeFor = (a) => (a.id === 1
    ? { mode: 'walk', distance: 1200, duration: 900, geometry: { type: 'LineString', coordinates: [[135.7, 35.01], [135.71, 35.015], [135.7, 35.02]] } }
    : null);
  const model = buildPublicDayShareModel({ title: 'Día 3 · jueves', subtitle: 'Kioto', places, routeFor, colorFor: () => '#C24E36' });
  assert.deepEqual(Object.keys(model).sort(), ['legs', 'mapsLinks', 'places', 'subtitle', 'title']);
  assert.deepEqual(Object.keys(model.places[0]).sort(), ['address', 'category', 'color', 'googlePlaceId', 'lat', 'lon', 'name', 'number']);
  assert.equal(model.places[0].color, '#c24e36');
  assert.equal(model.legs.length, 2);
  assert.equal(model.legs[0].mode, 'walk');
  assert.deepEqual(decodePolyline(model.legs[0].path), [[35.01, 135.7], [35.015, 135.71], [35.02, 135.7]]);
  assert.deepEqual(model.legs[1], { mode: '', distance: 0, duration: 0, path: '', steps: [], parts: [] });
  assert.equal(model.mapsLinks.length, 1);
  assert.doesNotMatch(JSON.stringify(model), /privada|s1/);
});

test('el link corto vive en /share/dia/<id> con lectura pública solo por get', () => {
  const main = readFileSync(resolve('src/main.jsx'), 'utf8');
  const repository = readFileSync(resolve('src/modules/share/dayShareRepository.js'), 'utf8');
  const rules = readFileSync(resolve('firestore.rules'), 'utf8');
  assert.ok(main.includes('match(/^\\/share\\/dia\\/([^/]+)\\/?$/)'));
  assert.match(repository, /const DAY_SHARE_COLLECTION = 'dayShares'/);
  assert.match(repository, /\/share\/dia\//);
  const block = rules.slice(rules.indexOf('match /dayShares/{shareId}'));
  assert.match(block, /allow get: if true;\s*allow list: if false;/);
  assert.match(block, /request\.auth\.uid == request\.resource\.data\.ownerId/);
  assert.match(block, /allow update, delete: if false/);
});

test('el diagnóstico local refleja las condiciones de las reglas', async () => {
  const { dayShareModelIssues } = await import('../src/modules/share/dayRouteShare.js');
  const model = buildPublicDayShareModel({ title: 'Día 1', subtitle: '', places: [place(1)], routeFor: () => null });
  assert.deepEqual(dayShareModelIssues(model), []);
  assert.deepEqual(dayShareModelIssues({ ...model, places: [] }), ['places:0']);
});

test('un tramo en transporte guarda líneas, estaciones y trazos por línea', () => {
  const route = {
    mode: 'transit',
    distance: 4000,
    duration: 1200,
    transitSteps: [{ lineShortName: 'M1', lineColor: '#FFCD00', lineTextColor: '#000000', vehicleType: 'SUBWAY', departureStop: 'Châtelet', arrivalStop: 'Bastille', stopCount: 3, headsign: 'Château de Vincennes' }],
    segments: [
      { kind: 'walk', geometry: { coordinates: [[2.34, 48.85], [2.345, 48.858]] } },
      { kind: 'transit', color: '#FFCD00', geometry: { coordinates: [[2.345, 48.858], [2.369, 48.853]] } },
    ],
  };
  const model = buildPublicDayShareModel({ title: 'Día 1', subtitle: 'París', places: [place(1), place(2)], routeFor: () => route });
  assert.deepEqual(model.legs[0].steps, [{ line: 'M1', color: '#ffcd00', textColor: '#000000', vehicle: 'SUBWAY', from: 'Châtelet', to: 'Bastille', stops: 3, headsign: 'Château de Vincennes' }]);
  assert.deepEqual(model.legs[0].parts.map((part) => [part.kind, part.color]), [['walk', ''], ['transit', '#ffcd00']]);
  assert.deepEqual(decodePolyline(model.legs[0].parts[1].path), [[48.858, 2.345], [48.853, 2.369]]);
});
