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
