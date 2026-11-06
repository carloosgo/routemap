// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header interactions stay shadow-free while active primary navigation uses strong gray text', async () => {
  const polish = await read('src/app/HeaderRequestedPolish.css');

  assert.match(
    polish,
    /\.trip-summary__primary-nav-item:hover,[\s\S]*\.trip-summary__metric:hover,[\s\S]*background:\s*transparent;/
  );
  assert.match(
    polish,
    /\.trip-summary__selector-option:hover,[\s\S]*\.trip-summary__selector-option\.is-active\s*\{[^}]*background:\s*transparent;/s
  );
  assert.match(
    polish,
    /\.trip-summary__primary-nav-item\.is-active,[\s\S]*\.trip-summary__primary-nav-item\.is-active \.trip-summary__primary-nav-label\s*\{[^}]*color:\s*#5f6875;/s
  );
  assert.doesNotMatch(polish, /background:\s*#f6f7f8|background:\s*rgba\(25,\s*165,\s*208/);
});

test('desktop note panel keeps only a light gutter from the itinerary panel', async () => {
  const placement = await read('src/app/NotePanelPlacement.css');
  const main = await read('src/main.jsx');

  assert.match(
    placement,
    /@media \(min-width:\s*721px\)[\s\S]*\.segnote\s*\{[^}]*left:\s*14px;/s
  );
  assert.match(main, /import '\.\/app\/NotePanelPlacement\.css';/);
  assert.ok(
    main.indexOf('HeaderRequestedPolish.css') < main.indexOf('NotePanelPlacement.css'),
    'la posición final de notas debe cargarse al final de la cascada de workspace/header'
  );
});
