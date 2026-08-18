import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('legacy header icon injection is no longer loaded', async () => {
  const html = await read('index.html');
  const main = await read('src/main.jsx');

  assert.doesNotMatch(html, /custom-header-icons\.css/);
  assert.match(main, /ItineraryTimelineRedesign\.css/);
});

test('desktop editor navigation uses the requested left rail and canonical Atlas icons', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const css = await read('src/app/ItineraryTimelineRedesign.css');

  assert.match(editor, /className="editor-sidebar"/);
  assert.match(editor, /\/icons\/tramos\.svg/);
  assert.match(editor, /lugaresIcon/);
  assert.match(editor, /\/icons\/notas\.svg/);
  assert.match(menu, /\/icons\/moneda\.svg/);
  assert.match(menu, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(menu, /setCurrency\(currency\)/);
  assert.match(css, /background:\s*#fdfdfd;/);
  assert.match(css, /\.editor-sidebar__item::after[\s\S]*width:\s*48px;[\s\S]*background:\s*#eceef1;/);
  assert.match(css, /box-shadow:\s*8px 0 22px rgba\(15, 23, 42, 0\.075\);/);
});

test('itinerary timeline keeps a fixed origin marker, dotted connector and destination rows', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const origin = await read('src/modules/trips/ItineraryOriginNode.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const css = await read('src/app/ItineraryTimelineRedesign.css');

  assert.match(form, /index === 0/);
  assert.match(form, /<ItineraryOriginNode/);
  assert.match(origin, /itinerary-finish-flag\.svg/);
  assert.match(header, /segment\.destination/);
  assert.match(header, /format|formattedDateLines/);
  assert.match(header, /segment__nights/);
  assert.match(header, /segment__pill/);
  assert.match(header, /segment__note-btn/);
  assert.match(header, /segment__toggle/);
  assert.match(header, /segment__remove/);
  assert.match(header, /segment__drag-handle/);
  assert.match(css, /repeating-linear-gradient\(/);
  assert.match(css, /-webkit-line-clamp:\s*2;/);
  assert.match(css, /\.timeline-city-picker__country[\s\S]*color:\s*#9097a2;/);
});

test('places uses a self-contained transparent signpost icon in the Atlas palette', async () => {
  const icon = await read('src/assets/lugares-storefront-v2.svg');

  assert.match(icon, /viewBox="0 0 40 40"/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, /#14394b/);
  assert.match(icon, /fill="#11c7dc"/);
  assert.equal((icon.match(/fill="#fff3d6"/g) || []).length, 3);
  assert.doesNotMatch(icon, />CAFE<\/text>/);
  assert.doesNotMatch(icon, /#b7c58a|#c79a6b/);
  assert.doesNotMatch(icon, /data:image\//);
  assert.doesNotMatch(icon, /<image\b/);
  assert.doesNotMatch(icon, /<metadata>/);
});
