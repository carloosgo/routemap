import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayGoogleMapsLinks,
  dayShareFileName,
  dayShareText,
  dayStaticMapUrl,
  encodePolyline,
} from '../src/modules/share/dayRouteShare.js';

const t = (key) => ({
  place: 'Lugar',
  routeModeWalk: 'A pie',
  routeModeTransit: 'Transporte público',
  shareDayMapsLink: 'Ruta en Google Maps:',
  shareDayMapsLinks: 'Ruta en Google Maps (por partes):',
}[key] || key);

const place = (id, extra = {}) => ({ id, name: `P${id}`, city: 'Kioto', lat: 35 + Number(id) / 100, lon: 135.7, ...extra });

test('encodePolyline matches Google reference example', () => {
  assert.equal(encodePolyline([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
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

test('a single place links to a Maps search', () => {
  const [link] = dayGoogleMapsLinks([place(1, { googlePlaceId: 'g1' })], () => null);
  assert.match(link, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  assert.equal(new URL(link).searchParams.get('query_place_id'), 'g1');
});

test('share text lists numbered places, chosen legs and the maps link', () => {
  const places = [place(1, { address: 'Calle 1' }), place(2)];
  const routeFor = () => ({ mode: 'walk', duration: 900, distance: 1200 });
  const links = dayGoogleMapsLinks(places, routeFor);
  const text = dayShareText({ title: 'Día 3 · jueves', subtitle: 'Kioto', places, routeFor, links, t, intlLocale: 'es-MX' });
  assert.equal(text.split('\n')[0], 'Día 3 · jueves · Kioto');
  assert.match(text, /1\. P1 \(Calle 1\)/);
  assert.match(text, /↓ A pie · 15 min · 1\.2 km/);
  assert.match(text, /2\. P2/);
  assert.match(text, /Ruta en Google Maps:\nhttps:\/\/www\.google\.com\/maps\/dir\//);
});

test('static map numbers stops in their country color and draws each leg', () => {
  const places = [place(1), place(2)];
  const url = new URL(dayStaticMapUrl(places, {
    routeFor: () => ({ mode: 'walk', geometry: { type: 'LineString', coordinates: [[135.7, 35.01], [135.71, 35.015], [135.7, 35.02]] } }),
    colorFor: () => '#C24E36',
    apiKey: 'k',
    mapId: 'm',
  }));
  const markers = url.searchParams.getAll('markers');
  assert.deepEqual(markers, ['color:0xc24e36|label:1|35.010000,135.700000', 'color:0xc24e36|label:2|35.020000,135.700000']);
  assert.equal(url.searchParams.getAll('path').length, 1);
  assert.match(url.searchParams.get('path'), /^color:0x475467\|weight:5\|enc:/);
  assert.equal(url.searchParams.get('map_id'), 'm');
  assert.equal(dayStaticMapUrl(places, { apiKey: '' }), '');
});

test('file name is ascii and readable', () => {
  assert.equal(dayShareFileName(3, 'Ciudad de México'), 'atlas-dia-3-ciudad-de-mexico.png');
});
