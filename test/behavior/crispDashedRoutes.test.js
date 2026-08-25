// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrispDashedRoutes } from '../../src/modules/map/crispDashedRoutes.js';

function createRendererEnvironment() {
  const polylines = [];
  let overlayViewConstructions = 0;

  class Polyline {
    constructor(options) {
      this.options = options;
      this.map = options.map;
      this.path = options.path;
      this.setPathCalls = 0;
      this.setMapCalls = [];
      polylines.push(this);
    }

    setPath(path) {
      this.path = path;
      this.setPathCalls += 1;
    }

    setMap(map) {
      this.map = map;
      this.setMapCalls.push(map);
    }
  }

  class OverlayView {
    constructor() {
      overlayViewConstructions += 1;
      throw new Error('custom OverlayView rendering must not be used for itinerary routes');
    }
  }

  return {
    maps: { Polyline, OverlayView },
    map: { id: 'map' },
    polylines,
    get overlayViewConstructions() {
      return overlayViewConstructions;
    },
  };
}

test('renderer delegates dashed itinerary routes to native Google Maps polylines', () => {
  const env = createRendererEnvironment();
  const renderer = createCrispDashedRoutes({
    maps: env.maps,
    map: env.map,
    routes: [{
      path: [{ lat: 10, lng: 20 }, { lat: 11, lng: 22 }],
      color: '#123456',
    }],
  });

  assert.equal(env.overlayViewConstructions, 0);
  assert.equal(env.polylines.length, 1);

  const polyline = env.polylines[0];
  assert.equal(polyline.map, env.map);
  assert.deepEqual(polyline.path, [{ lat: 10, lng: 20 }, { lat: 11, lng: 22 }]);
  assert.equal(polyline.options.strokeOpacity, 0);
  assert.equal(polyline.options.clickable, false);
  assert.equal(polyline.options.geodesic, false);
  assert.equal(polyline.options.icons.length, 1);
  assert.equal(polyline.options.icons[0].offset, '0');
  assert.equal(polyline.options.icons[0].repeat, '10px');
  assert.equal(polyline.options.icons[0].icon.path, 'M 0,-2 0,2');
  assert.equal(polyline.options.icons[0].icon.strokeColor, '#111111');
  assert.equal(polyline.options.icons[0].icon.strokeOpacity, 1);
  assert.equal(polyline.options.icons[0].icon.strokeWeight, 2);

  renderer.refresh();
  assert.equal(polyline.map, env.map);
  assert.equal(polyline.setPathCalls, 0);
  assert.deepEqual(polyline.setMapCalls, []);

  renderer.dispose();
  assert.equal(polyline.map, null);
});

test('renderer reuses native polylines when routes change and removes only surplus routes', () => {
  const env = createRendererEnvironment();
  const renderer = createCrispDashedRoutes({
    maps: env.maps,
    map: env.map,
    routes: [
      { path: [{ lat: 10, lng: 20 }, { lat: 11, lng: 22 }] },
      { path: [{ lat: 30, lng: 40 }, { lat: 31, lng: 44 }] },
    ],
  });

  const [firstPolyline, secondPolyline] = env.polylines;
  renderer.setRoutes([{
    path: [
      { lat: () => 50, lng: () => 60 },
      { lat: () => 51, lng: () => 64 },
      { lat: 'invalid', lng: 70 },
    ],
  }]);

  assert.equal(env.polylines.length, 2);
  assert.equal(firstPolyline.setPathCalls, 1);
  assert.deepEqual(firstPolyline.path, [{ lat: 50, lng: 60 }, { lat: 51, lng: 64 }]);
  assert.equal(firstPolyline.map, env.map);
  assert.equal(secondPolyline.map, null);
  assert.deepEqual(secondPolyline.setMapCalls, [null]);

  renderer.setRoutes([{ path: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] }]);
  assert.equal(env.polylines.length, 2);
  assert.equal(firstPolyline.setPathCalls, 2);
  assert.equal(firstPolyline.map, env.map);

  renderer.dispose();
  assert.equal(firstPolyline.map, null);
});

test('renderer keeps a safe degraded API when native Google Maps polylines are unavailable', () => {
  const renderer = createCrispDashedRoutes({ maps: null, map: null, routes: [] });
  assert.doesNotThrow(() => renderer.setRoutes([]));
  assert.doesNotThrow(() => renderer.refresh());
  assert.doesNotThrow(() => renderer.dispose());

  const noPolylineRenderer = createCrispDashedRoutes({ maps: {}, map: {}, routes: [] });
  assert.doesNotThrow(() => noPolylineRenderer.setRoutes([]));
  assert.doesNotThrow(() => noPolylineRenderer.refresh());
  assert.doesNotThrow(() => noPolylineRenderer.dispose());
});
