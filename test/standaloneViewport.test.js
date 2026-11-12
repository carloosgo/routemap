import test from 'node:test';
import assert from 'node:assert/strict';
import { standaloneAppHeight } from '../src/app/standaloneViewport.js';

const iphone = (overrides = {}) => ({
  navigator: { standalone: true },
  matchMedia: () => ({ matches: false }),
  screen: { width: 393, height: 852 },
  innerWidth: 393,
  innerHeight: 793,
  ...overrides,
});

test('installed iPhone app uses the full screen height, not the short viewport', () => {
  assert.equal(standaloneAppHeight(iphone()), 852);
});

test('landscape uses the short screen side', () => {
  assert.equal(standaloneAppHeight(iphone({ innerWidth: 852, innerHeight: 334 })), 393);
});

test('Safari tab (not installed) keeps the CSS viewport', () => {
  assert.equal(standaloneAppHeight(iphone({ navigator: { standalone: false } })), null);
});

test('installed app marks the root so html/body grow to the screen height', async () => {
  const { installStandaloneViewport } = await import('../src/app/standaloneViewport.js');
  const classes = new Set();
  const props = {};
  const win = iphone({
    document: { documentElement: {
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
      style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } },
    } },
    addEventListener() {},
    removeEventListener() {},
  });
  installStandaloneViewport(win);
  assert.ok(classes.has('is-standalone-app'));
  assert.equal(props['--app-height'], '852px');
});
