// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrispDashedRoutes } from '../../src/modules/map/crispDashedRoutes.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.style = {};
    this.parent = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

function installRendererEnvironment() {
  const previousDocument = globalThis.document;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const pane = new FakeElement('pane');
  const overlays = [];
  const frames = new Map();
  let nextFrameId = 1;

  class LatLng {
    constructor(value) {
      this.lat = Number(value?.lat);
      this.lng = Number(value?.lng);
    }
  }

  class OverlayView {
    constructor() {
      this.map = null;
      overlays.push(this);
    }

    setMap(nextMap) {
      const hadMap = Boolean(this.map);
      this.map = nextMap;
      if (nextMap) this.onAdd?.();
      if (!nextMap && hadMap) this.onRemove?.();
    }

    getPanes() {
      return { overlayLayer: pane };
    }

    getProjection() {
      return {
        fromLatLngToDivPixel(point) {
          return { x: point.lng, y: point.lat };
        },
      };
    }
  }

  globalThis.document = {
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName);
    },
  };
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };

  return {
    maps: { LatLng, OverlayView },
    map: { id: 'map' },
    pane,
    overlays,
    flushFrames() {
      while (frames.size) {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback());
      }
    },
    restore() {
      globalThis.document = previousDocument;
      globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    },
  };
}

test('renderer crea una sola OverlayView y actualiza la línea punteada sin flechas ni desmontarla', () => {
  const env = installRendererEnvironment();
  try {
    const renderer = createCrispDashedRoutes({
      maps: env.maps,
      map: env.map,
      routes: [{
        path: [{ lat: 10, lng: 20 }, { lat: 11, lng: 22 }],
        color: '#123456',
      }],
    });

    assert.equal(env.overlays.length, 1);
    env.flushFrames();

    const svg = env.pane.children[0];
    assert.equal(svg?.tagName, 'svg');
    assert.equal(svg.children.length, 1);
    assert.equal(svg.children[0].tagName, 'path');
    assert.equal(svg.children[0].getAttribute('stroke-dasharray'), '4 6');
    assert.equal(svg.children[0].getAttribute('stroke-width'), '2');
    assert.equal(svg.children[0].getAttribute('d'), 'M 20.00 10.00 L 22.00 11.00');
    const routeElement = svg.children[0];

    renderer.setRoutes([{
      path: [{ lat: 30, lng: 40 }, { lat: 31, lng: 44 }],
      color: '#654321',
    }]);

    // El trazado anterior sigue presente hasta que el mismo nodo recibe la
    // geometría nueva; no existe un frame intermedio sin ruta.
    assert.equal(svg.children.length, 1);
    assert.equal(svg.children[0], routeElement);
    assert.equal(svg.children[0].getAttribute('d'), 'M 20.00 10.00 L 22.00 11.00');

    env.flushFrames();

    assert.equal(env.overlays.length, 1);
    assert.equal(svg.children.length, 1);
    assert.equal(svg.children[0], routeElement);
    assert.equal(svg.children[0].getAttribute('d'), 'M 40.00 30.00 L 44.00 31.00');

    renderer.refresh();
    env.flushFrames();
    assert.equal(env.overlays.length, 1);

    renderer.dispose();
    assert.equal(env.pane.children.length, 0);
  } finally {
    env.restore();
  }
});

test('renderer degradado conserva una API segura sin Google Maps', () => {
  const renderer = createCrispDashedRoutes({ maps: null, map: null, routes: [] });
  assert.doesNotThrow(() => renderer.setRoutes([]));
  assert.doesNotThrow(() => renderer.refresh());
  assert.doesNotThrow(() => renderer.dispose());
});
